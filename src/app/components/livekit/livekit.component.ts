import { LivekitService } from './../../services/livekit.service';
import { Component, OnInit } from '@angular/core';
@Component({
  selector: 'app-livekit',
  templateUrl: './livekit.component.html',
  styleUrls: ['./livekit.component.scss'],
})
export class LivekitComponent implements OnInit {

  constructor(public livekitService:LivekitService){
  }
  ngOnInit(): void {
    this.livekitService.handleDevicesChanged();
    this.livekitService.populateSupportedCodecs();
  }

}
