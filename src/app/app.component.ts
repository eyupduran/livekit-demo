import { LivekitService } from './services/livekit.service';
import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  constructor(
    public livekitService:LivekitService
  ){}
  
  ngOnInit(): void {
   
  }
}
