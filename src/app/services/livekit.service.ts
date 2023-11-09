import { Injectable } from '@angular/core';
import {
  ConnectionQuality,
  ConnectionState,
  DataPacket_Kind,
  DisconnectReason,
  ExternalE2EEKeyProvider,
  LocalAudioTrack,
  LocalParticipant,
  LogLevel,
  MediaDeviceFailure,
  Participant,
  ParticipantEvent,
  RemoteParticipant,
  RemoteTrackPublication,
  RemoteVideoTrack,
  Room,
  RoomConnectOptions,
  RoomEvent,
  RoomOptions,
  SimulationScenario,
  Track,
  TrackPublication,
  VideoCaptureOptions,
  VideoCodec,
  VideoPresets,
  VideoQuality,
  createAudioAnalyser,
  setLogLevel,
  supportsAV1,
  supportsVP9,
} from 'livekit-client';
import { identity } from 'rxjs';



@Injectable({
  providedIn: 'root'
})
export class LivekitService {

  room: Room;  
  message :string 
  state = {
    isFrontFacing: false,
    encoder: new TextEncoder(),
    decoder: new TextDecoder(),
    defaultDevices: new Map<MediaDeviceKind, string>(),
    bitrateInterval: undefined as any,
    e2eeKeyProvider: new ExternalE2EEKeyProvider(),
  };
  //Connection
  public livekitUrl: string;
  public token: string;
  public e2EEKey: string;

  //
  participantIdentity: any;
  devices: MediaDeviceInfo[]
  //connect options
  simulcast: boolean = true
  dynacast: boolean = true
  forceTurn: any = false
  adaptiveStream:boolean = true
  publishOption: boolean = true
  preferredCodec: VideoCodec;
  autoSubscribe:boolean = true
  e2eeEnabled: any = false
  e2ee: any = false

  //PARTICIPANTS
  participants: Participant[];
  startTime: number;
  elementMapping: { [k: string]: MediaDeviceKind } = {
    'video-input': 'videoinput',
    'audio-input': 'audioinput',
    'audio-output': 'audiooutput',
  };
  constructor() { }

  async connectWithFormInput() {
    const url = this.livekitUrl;
    const token = this.token;
    const simulcast = this.simulcast;
    const dynacast = this.dynacast;
    const forceTURN = this.forceTurn;
    const adaptiveStream = this.adaptiveStream;
    const shouldPublish = this.publishOption;
    const preferredCodec = this.preferredCodec;
    // const cryptoKey = this.c;
    const autoSubscribe = this.autoSubscribe;
    const e2eeEnabled = this.e2ee;

    setLogLevel(LogLevel.debug);
    this.updateSearchParams(url, token);

    const roomOpts: RoomOptions = {
      adaptiveStream,
      dynacast,
      publishDefaults: {
        simulcast,
        videoSimulcastLayers: [VideoPresets.h90, VideoPresets.h216],
        videoCodec: preferredCodec || 'vp8',
        dtx: true,
        red: true,
        forceStereo: false,
      },
      videoCaptureDefaults: {
        resolution: VideoPresets.h720.resolution,
      },
      e2ee: e2eeEnabled
        ? {
          keyProvider: this.state.e2eeKeyProvider,
          worker: new Worker(
            new URL('livekit-client/e2ee-worker', import.meta.url)
          ),
        }
        : undefined,
    };
    if (
      roomOpts.publishDefaults?.videoCodec === 'av1' ||
      roomOpts.publishDefaults?.videoCodec === 'vp9'
    ) {
      //roomOpts.publishDefaults.backupCodec = false; //DEFAULTU TRUE:BAKILACAK
    }

    const connectOpts: RoomConnectOptions = {
      autoSubscribe: autoSubscribe,
    };
    if (forceTURN) {
      connectOpts.rtcConfig = {
        iceTransportPolicy: 'relay',
      };
    }
    await this.connectToRoom(url, token, roomOpts, connectOpts, shouldPublish);

    this.state.bitrateInterval = setInterval(this.renderBitrate, 1000);
  }
 populateSupportedCodecs() {
    const codecSelect = <HTMLSelectElement>document.getElementById('preferred-codec');
    const options: string[][] = [
      ['', 'Preferred codec'],
      ['h264', 'H.264'],
      ['vp8', 'VP8'],
    ];
    if (supportsVP9()) {
      options.push(['vp9', 'VP9']);
    }
    if (supportsAV1()) {
      options.push(['av1', 'AV1']);
    }
    for (const o of options) {
      const n = document.createElement('option');
      n.value = o[0];
      n.appendChild(document.createTextNode(o[1]));
      codecSelect.appendChild(n);
    }
  }
  updateSearchParams(url: string, token: string, key?: string) {
    const params = new URLSearchParams({ url, token });
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}?${params.toString()}`
    );
  }

  renderBitrate() {
    if (!this.room || this.room.state !== ConnectionState.Connected) {
      return;
    }
    const participants: Participant[] = [...this.room.participants.values()];
    participants.push(this.room.localParticipant);
    this.participants.push(...this.room.participants.values());
    for (const p of participants) {
      const elm = <HTMLElement>document.getElementById("bitrade-"+identity)
      let totalBitrate = 0;
      for (const t of p.tracks.values()) {
        if (t.track) {
          totalBitrate += t.track.currentBitrate;
        }

        if (t.source === Track.Source.Camera) {
          if (t.videoTrack instanceof RemoteVideoTrack) {
            const codecElm = <HTMLElement>document.getElementById("codec-"+identity)
            codecElm.innerHTML = t.videoTrack.getDecoderImplementation() ?? '';
          }
        }
      }
      let displayText = '';
      if (totalBitrate > 0) {
        displayText = `${Math.round(
          totalBitrate / 1024
        ).toLocaleString()} kbps`;
      }
      if (elm) {
         elm.innerHTML = displayText;
      }
    }
  }

  async connectToRoom(
    url: string,
    token: string,
    roomOptions?: RoomOptions,
    connectOptions?: RoomConnectOptions,
    shouldPublish?: boolean
  ): Promise<Room | undefined> {
    this.room = new Room(roomOptions);

    const startTime = Date.now();
    await this.room.prepareConnection(url, token);
    const prewarmTime = Date.now() - startTime;
-
    this.room
      .on(RoomEvent.ParticipantConnected, this.participantConnected)
      .on(RoomEvent.Disconnected, this.handleRoomDisconnect)
      .on(RoomEvent.DataReceived, this.handleData)
      .on(RoomEvent.ParticipantDisconnected, this.participantDisconnected)
      .on(RoomEvent.Reconnected, async () => {
      })
      .on(RoomEvent.LocalTrackPublished, (pub) => {
        const track = pub.track as LocalAudioTrack;

        if (track instanceof LocalAudioTrack) {
          const { calculateVolume } = createAudioAnalyser(track);

          setInterval(() => {
            const codecElm = <HTMLElement>document.getElementById("local-volume")
             codecElm.setAttribute('value', calculateVolume().toFixed(4));
          }, 200);
        }
        this.renderParticipant(this.room.localParticipant);
        this.updateButtonsForPublishState();
        this.renderScreenShare(this.room);
      })
      .on(RoomEvent.LocalTrackUnpublished, () => {
        this.renderParticipant(this.room.localParticipant);
        this.updateButtonsForPublishState();
        this.renderScreenShare(this.room);
      })
      .on(RoomEvent.RoomMetadataChanged, (metadata) => {
      })
      .on(RoomEvent.MediaDevicesChanged, this.handleDevicesChanged)
      .on(RoomEvent.AudioPlaybackStatusChanged, () => {
        if (this.room.canPlaybackAudio) {
          const element = <HTMLButtonElement>document.getElementById("start-audio-button")
          element.setAttribute('disabled', 'true');

        } else {
          const element = <HTMLButtonElement>document.getElementById("start-audio-button")
          element.setAttribute('disabled', 'true');
        }
      })
      .on(RoomEvent.MediaDevicesError, (e: Error) => {
        const failure = MediaDeviceFailure.getFailure(e);
      })
      .on(
        RoomEvent.ConnectionQualityChanged,
        (quality: ConnectionQuality, participant?: Participant) => {
        }
      )
      .on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
        this.renderParticipant(participant);
        this.renderScreenShare(this.room);
      })
      .on(RoomEvent.TrackUnsubscribed, (_, pub, participant) => {
        this.renderParticipant(participant);
        this.renderScreenShare(this.room);
      })
      .on(RoomEvent.SignalConnected, async () => {
        const signalConnectionTime = Date.now() - startTime;
        // speed up publishing by starting to publish before it's fully connected
        // publishing is accepted as soon as signal connection has established
        if (shouldPublish) {
          await this.room.localParticipant.enableCameraAndMicrophone();
          this.updateButtonsForPublishState();
        }
      })
      .on(RoomEvent.ParticipantEncryptionStatusChanged, () => {
        this.updateButtonsForPublishState();
      })
      .on(
        RoomEvent.TrackStreamStateChanged,
        (pub, streamState, participant) => {
        }
      );

    try {
      // read and set current key from input
      const cryptoKey = this.e2EEKey;
      this.state.e2eeKeyProvider.setKey(cryptoKey);
      if (this.e2ee) {
        await this.room.setE2EEEnabled(true);
      }

      await this.room.connect(url, token, connectOptions);
      const elapsed = Date.now() - startTime;
    } catch (error: any) {
      let message: any = error;
      if (error.message) {
        message = error.message;
      }
      return;
    }
    let currentRoom = this.room;
     this.setButtonsForState(true);

    this.room.participants.forEach((participant) => {
      this.participantConnected(participant);
    });
    this.participantConnected(this.room.localParticipant);
    return this.room;
  }

  async toggleAudio() {
    if (!this.room) return;
    const enabled = this.room.localParticipant.isMicrophoneEnabled;
    this.setButtonDisabled('toggle-audio-button', true);
    if (enabled) {
    } else {
    }
    await this.room.localParticipant.setMicrophoneEnabled(!enabled);
    this.setButtonDisabled('toggle-audio-button', false);
    this.updateButtonsForPublishState();
  }
  setButtonDisabled(buttonId: string, isDisabled: boolean) {
    const el = <HTMLButtonElement>document.getElementById(buttonId)
    el.disabled = isDisabled;
  }

  async toggleVideo() {
    if (!this.room) return;
    this.setButtonDisabled('toggle-video-button', true);
    const enabled = this.room.localParticipant.isCameraEnabled;
    if (enabled) {
    } else {
    }
    await this.room.localParticipant.setCameraEnabled(!enabled);
    this.setButtonDisabled('toggle-video-button', false);
    this.renderParticipant(this.room.localParticipant);

    // update display
    this.updateButtonsForPublishState();
  }

  flipVideo() {
    const videoPub = this.room?.localParticipant.getTrack(Track.Source.Camera);
    if (!videoPub) {
      return;
    }
    if (this.state.isFrontFacing) {
       this.setButtonState('flip-video-button', 'Front Camera', false);
    } else {
       this.setButtonState('flip-video-button', 'Back Camera', false);
    }
    this.state.isFrontFacing = !this.state.isFrontFacing;
    const options: VideoCaptureOptions = {
      resolution: VideoPresets.h720.resolution,
      facingMode: this.state.isFrontFacing ? 'user' : 'environment',
    };
    videoPub.videoTrack?.restartTrack(options);
  }

  async shareScreen() {
    if (!this.room) return;
    const enabled = this.room.localParticipant.isScreenShareEnabled;
    this.setButtonDisabled('share-screen-button', true);
    await this.room.localParticipant.setScreenShareEnabled(!enabled, {
      audio: true,
    });
    this.setButtonDisabled('share-screen-button', false);
    this.updateButtonsForPublishState();
  }
  async toggleE2EE() {
    if (!this.room || !this.room.options.e2ee) {
      return;
    }
    // read and set current key from input
    const cryptoKeyInput = document.getElementById('crypto-key') as HTMLInputElement | null;
        if (cryptoKeyInput) {
          let cryptoKey = cryptoKeyInput.value;
          this.state.e2eeKeyProvider.setKey(cryptoKey);
        }
    //cryptoKey = cryptoKey.value

    await this.room.setE2EEEnabled(!this.room.isE2EEEnabled);
  }
  async ratchetE2EEKey() {
    if (!this.room || !this.room.options.e2ee) {
      return;
    }
    await this.state.e2eeKeyProvider.ratchetKey();
  }

  handleScenario(e: Event) {
    const scenario = (<HTMLSelectElement>e.target).value;
    if (scenario === 'subscribe-all') {
      this.room?.participants.forEach((p) => {
        p.tracks.forEach((rp) => rp.setSubscribed(true));
      });
    } else if (scenario === 'unsubscribe-all') {
      this.room?.participants.forEach((p) => {
        p.tracks.forEach((rp) => rp.setSubscribed(false));
      });
    } else if (scenario !== '') {
      this.room?.simulateScenario(scenario as SimulationScenario);
      (<HTMLSelectElement>e.target).value = '';
    }
  }
  disconnectRoom() {
    if (this.room) {
      this.room.disconnect();
    }
    if (this.state.bitrateInterval) {
      clearInterval(this.state.bitrateInterval);
    }
  }

  startAudio() {
    this.room?.startAudio();
  }
  handlePreferredQuality(e: Event) {
    const quality = (<HTMLSelectElement>e.target).value;
    let q = VideoQuality.HIGH;
    switch (quality) {
      case 'low':
        q = VideoQuality.LOW;
        break;
      case 'medium':
        q = VideoQuality.MEDIUM;
        break;
      case 'high':
        q = VideoQuality.HIGH;
        break;
      default:
        break;
    }
    if (this.room) {
      this.room.participants.forEach((participant) => {
        participant.tracks.forEach((track) => {
          track.setVideoQuality(q);
        });
      });
    }
  }
  handlePreferredFPS(e: Event) {
    const fps = +(<HTMLSelectElement>e.target).value;
    if (this.room) {
      this.room.participants.forEach((participant) => {
        participant.tracks.forEach((track) => {
          track.setVideoFPS(fps);
        });
      });
    }
  }

  async handleDeviceSelected(e: Event) {
    const deviceId = (<HTMLSelectElement>e.target).value;
    const elementId = (<HTMLSelectElement>e.target).id;
    const kind = this.elementMapping[elementId];
    if (!kind) {
      return;
    }
    this.state.defaultDevices.set(kind, deviceId);

    if (this.room) {
      await this.room.switchActiveDevice(kind, deviceId);
    }
  }


  participantConnected(participant: Participant) {
    console.log('tracks', participant.tracks);
    participant
      .on(ParticipantEvent.TrackMuted, (pub: TrackPublication) => {
        this.renderParticipant(participant);
      })
      .on(ParticipantEvent.TrackUnmuted, (pub: TrackPublication) => {
        this.renderParticipant(participant);
      })
      .on(ParticipantEvent.IsSpeakingChanged, () => {
        this.renderParticipant(participant);
      })
      .on(ParticipantEvent.ConnectionQualityChanged, () => {
        this.renderParticipant(participant);
      });
  }

  renderParticipant(participant: Participant, remove: boolean = false) {
    const container = <HTMLElement>document.getElementById("participants-area");
    if (!container) return;
    const { identity } = participant;
    let div = <HTMLElement>document.getElementById("participant-" + identity);
    if (!div && !remove) {
      div = document.createElement('div');
      div.id = `participant-${identity}`;
      div.className = 'participant';
      div.innerHTML = `
      <video class="video-elm" id="video-${identity}"></video>
      <audio id="audio-${identity}"></audio>
      <div class="info-bar">
        <div id="name-${identity}" class="name">
        </div>
        <div style="text-align: center;">
          <span id="codec-${identity}" class="codec">
          </span>
          <span id="size-${identity}" class="size">
          </span>
          <span id="bitrate-${identity}" class="bitrate">
          </span>
        </div>
        <div class="right">
          <span id="signal-${identity}"></span>
          <span id="mic-${identity}" class="mic-on"></span>
          <span id="e2ee-${identity}" class="e2ee-on"></span>
        </div>
      </div>
      ${participant instanceof RemoteParticipant
          ? `<div class="volume-control">
        <input id="volume-${identity}" type="range" min="0" max="1" step="0.1" value="1" orient="vertical" />
      </div>`
          : `<progress id="local-volume" max="1" value="0"></progress>`
        }`;
      container.appendChild(div);
      let sizeElm = <HTMLSpanElement>document.getElementById("size-" + identity);
      let videoElm = <HTMLVideoElement>document.getElementById("video-" + identity);

      videoElm.onresize = () => {
        this.updateVideoSize(videoElm!, sizeElm!);
      };
    }
    let videoElm = <HTMLVideoElement>document.getElementById("video-" + identity);

    let audioELm = <HTMLAudioElement>document.getElementById("audio-" + identity);

    if (remove) {
      div.remove();
      container.style.display = 'none';
      if (videoElm) {
        videoElm.srcObject = null;
        videoElm.src = '';
      }
      if (audioELm) {
        audioELm.srcObject = null;
        audioELm.src = '';
      }
      return;
    }

    // update properties
    const element = <HTMLElement>document.getElementById("name-" + identity);
    element.innerHTML = participant.identity;

    if (participant instanceof LocalParticipant) {
      element.innerHTML += ' (you)';
    }
    const micElm = <HTMLElement>document.getElementById("mic-" + identity);
    const signalElm = <HTMLElement>document.getElementById("signal-" + identity);
    const cameraPub = participant.getTrack(Track.Source.Camera);
    const micPub = participant.getTrack(Track.Source.Microphone);
    if (participant.isSpeaking) {
      div!.classList.add('speaking');
    } else {
      div!.classList.remove('speaking');
    }

    if (participant instanceof RemoteParticipant) {
      const volumeSlider = <HTMLInputElement>document.getElementById("volume-" + identity);
      volumeSlider.addEventListener('input', (ev) => {
        participant.setVolume(
          Number.parseFloat((ev.target as HTMLInputElement).value)
        );
      });
    }

    const cameraEnabled =
      cameraPub && cameraPub.isSubscribed && !cameraPub.isMuted;
    if (cameraEnabled) {
      if (participant instanceof LocalParticipant) {
        // flip
        videoElm.style.transform = 'scale(-1, 1)';
      } else if (!cameraPub?.videoTrack?.attachedElements.includes(videoElm)) {
        const renderStartTime = Date.now();
        // measure time to render
        videoElm.onloadeddata = () => {
          const elapsed = Date.now() - renderStartTime;
          let fromJoin = 0;
          if (
            participant.joinedAt &&
            participant.joinedAt.getTime() < this.startTime
          ) {
            fromJoin = Date.now() - this.startTime;
          }
        };
      }
      cameraPub?.videoTrack?.attach(videoElm);
    } else {
      // clear information display
      let element = <HTMLElement>document.getElementById("size-" + identity);
      element.innerHTML = '';
      if (cameraPub?.videoTrack) {
        // detach manually whenever possible
        cameraPub.videoTrack?.detach(videoElm);
      } else {
        videoElm.src = '';
        videoElm.srcObject = null;
      }
    }

    const micEnabled = micPub && micPub.isSubscribed && !micPub.isMuted;
    if (micEnabled) {
      if (!(participant instanceof LocalParticipant)) {
        // don't attach local audio
        audioELm.onloadeddata = () => {
          if (
            participant.joinedAt &&
            participant.joinedAt.getTime() < this.startTime
          ) {
            const fromJoin = Date.now() - this.startTime;
          }
        };
        micPub?.audioTrack?.attach(audioELm);
      }
      micElm.className = 'mic-on';
      micElm.innerHTML = '<i class="fas fa-microphone"></i>';
    } else {
      micElm.className = 'mic-off';
      micElm.innerHTML = '<i class="fas fa-microphone-slash"></i>';
    }

    let e2eeElm = <HTMLElement>document.getElementById("e2ee-" + identity);

    if (participant.isEncrypted) {
      e2eeElm.className = 'e2ee-on';
      e2eeElm.innerHTML = '<i class="fas fa-lock"></i>';
    } else {
      e2eeElm.className = 'e2ee-off';
      e2eeElm.innerHTML = '<i class="fas fa-unlock"></i>';
    }

    switch (participant.connectionQuality) {
      case ConnectionQuality.Excellent:
      case ConnectionQuality.Good:
      case ConnectionQuality.Poor:
        signalElm.className = `connection-${participant.connectionQuality}`;
        signalElm.innerHTML = '<i class="fas fa-circle"></i>';
        break;
      default:
        signalElm.innerHTML = '';
      // do nothing
    }
  }

  updateVideoSize(element: HTMLVideoElement, target: HTMLElement) {
    target.innerHTML = `(${element.videoWidth}x${element.videoHeight})`;
  }
  participantDisconnected(participant: RemoteParticipant) {
    this.renderParticipant(participant, true);
  }

  handleData(msg: Uint8Array, participant?: RemoteParticipant) {
    console.log("handleData",msg);
    const str = this.state.decoder.decode(msg);
    const chat = <HTMLTextAreaElement>document.getElementById('chat');
    let from = 'server';
    if (participant) {
      from = participant.identity;
    }
    chat.value += `${from}: ${str}\n`;
  }

  handleRoomDisconnect(reason?: DisconnectReason) {
    if (!this.room) return;
    this.setButtonsForState(false);
    this.renderParticipant(this.room.localParticipant, true);
    this.room.participants.forEach((p) => {
      this.renderParticipant(p, true);
    });
    this.renderScreenShare(this.room);
     const container = <HTMLElement>document.getElementById("participants-area");

    if (container) {
      container.remove();
    }

    // clear the chat area on disconnect
    const chat = <HTMLTextAreaElement>document.getElementById('chat');
    chat.value = '';

  }

  updateButtonsForPublishState() {
    if (!this.room) {
      return;
    }
    const lp = this.room.localParticipant;

    // video
    this.setButtonState(
      'toggle-video-button',
      `${lp.isCameraEnabled ? 'Disable' : 'Enable'} Video`,
      lp.isCameraEnabled,
    );

    // audio
    this.setButtonState(
      'toggle-audio-button',
      `${lp.isMicrophoneEnabled ? 'Disable' : 'Enable'} Audio`,
      lp.isMicrophoneEnabled,
    );

    // screen share
    this.setButtonState(
      'share-screen-button',
      lp.isScreenShareEnabled ? 'Stop Screen Share' : 'Share Screen',
      lp.isScreenShareEnabled,
    );

    // e2ee
    this.setButtonState(
      'toggle-e2ee-button',
      `${this.room.isE2EEEnabled ? 'Disable' : 'Enable'} E2EE`,
      this.room.isE2EEEnabled,
    );
  }

  setButtonState(
    buttonId: string,
    buttonText: string,
    isActive: boolean,
    isDisabled: boolean | undefined = undefined,
  ) {
    const el = <HTMLButtonElement>document.getElementById(buttonId)
    if (!el) return;
    if (isDisabled !== undefined) {
      el.disabled = isDisabled;
    }
    el.innerHTML = buttonText;
    if (isActive) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  }
  renderScreenShare(room: Room) {
     let div = <HTMLElement>document.getElementById("screenshare-area")
    if (room.state !== ConnectionState.Connected) {
      div.style.display = 'none';
      return;
    }
    let participant: Participant | undefined;
    let screenSharePub: TrackPublication | undefined =
      room.localParticipant.getTrack(Track.Source.ScreenShare);
    let screenShareAudioPub: RemoteTrackPublication | undefined;
    if (!screenSharePub) {
      room.participants.forEach((p) => {
        if (screenSharePub) {
          return;
        }
        participant = p;
        const pub = p.getTrack(Track.Source.ScreenShare);
        if (pub?.isSubscribed) {
          screenSharePub = pub;
        }
        const audioPub = p.getTrack(Track.Source.ScreenShareAudio);
        if (audioPub?.isSubscribed) {
          screenShareAudioPub = audioPub;
        }
      });
    } else {
      participant = room.localParticipant;
    }

    if (screenSharePub && participant) {
      div.style.display = 'block';
      const videoElm = (<HTMLVideoElement>document.getElementById("screenshare-video"))
      screenSharePub.videoTrack?.attach(videoElm);
      if (screenShareAudioPub) {
        screenShareAudioPub.audioTrack?.attach(videoElm);
      }
      videoElm.onresize = () => {
        this.updateVideoSize(
          videoElm,
          <HTMLSpanElement>document.getElementById("screenshare-resolution")
        );
      };
      const infoElm = <HTMLElement>document.getElementById("screenshare-info")

      infoElm.innerHTML = `Screenshare from ${participant.identity}`;
    } else {
      div.style.display = 'none';
    }
  }

  async handleDevicesChanged() {
    Promise.all(
      Object.keys(this.elementMapping).map(async (id) => {
        const kind = this.elementMapping[id];
        if (!kind) {
          return;
        }
         this.devices = await Room.getLocalDevices(kind);
        const element = <HTMLSelectElement>document.getElementById(id);
        this.populateSelect(
          element,
          this.devices,
          this.state.defaultDevices.get(kind)
        );
      })
    );
  }

  populateSelect(
    element: HTMLSelectElement,
    devices: MediaDeviceInfo[],
    selectedDeviceId?: string
  ) {
    // clear all elements
    element.innerHTML = '';

    for (const device of devices) {
      const option = document.createElement('option');
      option.text = device.label;
      option.value = device.deviceId;
      if (device.deviceId === selectedDeviceId) {
        option.selected = true;
      }
      element.appendChild(option);
    }
  }

  setButtonsForState(connected: boolean) {
    const connectedSet = [
      'toggle-video-button',
      'toggle-audio-button',
      'share-screen-button',
      'disconnect-ws-button',
      'disconnect-room-button',
      'flip-video-button',
      'send-button',
    ];
    if (this.room && this.room.options.e2ee) {
      connectedSet.push('toggle-e2ee-button', 'e2ee-ratchet-button');
    }
    const disconnectedSet = ['connect-button'];

    const toRemove = connected ? connectedSet : disconnectedSet;
    const toAdd = connected ? disconnectedSet : connectedSet;
    toRemove.forEach((id) => {
      const element = <HTMLButtonElement>document.getElementById(id);
      if (element) {
        element.removeAttribute('disabled');
      }
    });
   toAdd.forEach((id) => {
    const element = <HTMLButtonElement>document.getElementById(id);
    if (element) {
      element.setAttribute('disabled', 'true');
    }
  });
  }

  enterText() {
    if (!this.room) return;
    if (this.message) {
      const msg = this.state.encoder.encode(this.message);
      this.room.localParticipant.publishData(msg, DataPacket_Kind.RELIABLE)

      let chatElm = <HTMLTextAreaElement>document.getElementById("chat");
      chatElm.value += `${this.room.localParticipant.identity} (me): ${msg}\n`;
      this.message = ""
    }
  }
}
