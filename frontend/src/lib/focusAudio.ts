// One audio context is unlocked by the timer's Start/Resume or Test sound action.
export class FocusAudio {
  private context?: AudioContext;
  private buffer?: AudioBuffer;
  private bufferUrl = '';
  private nodes: AudioScheduledSourceNode[] = [];
  private revision = 0;
  async arm(url?: string) {
    this.context ??= new AudioContext();
    await this.context.resume();
    if (url && this.bufferUrl !== url) {
      const response = await fetch(url);
      if (!response.ok) throw new Error('The selected alert sound is unavailable.');
      const data = await response.arrayBuffer();
      if (data.byteLength > 10 * 1024 * 1024) throw new Error('Alert sound is too large.');
      const decoded = await this.context.decodeAudioData(data);
      this.buffer = decoded; this.bufferUrl = url;
    }
  }
  stop() { this.revision++; this.nodes.forEach(node => { try {node.stop()} catch {/* already stopped */} }); this.nodes=[]; }
  async play(kind: string, volume: number, url?: string) {
    this.stop(); const token=this.revision;
    if (kind==='silent') return;
    await this.arm(url);
    if(token!==this.revision)return;
    const ctx=this.context!;
    if(ctx.state!=='running') throw new Error('Enable browser audio with Test sound or Resume.');
    const gain=ctx.createGain();gain.gain.value=volume;gain.connect(ctx.destination);
    if(url&&this.buffer){const node=ctx.createBufferSource();node.buffer=this.buffer;node.connect(gain);this.nodes.push(node);node.start();node.stop(ctx.currentTime+Math.min(8,this.buffer.duration));node.onended=()=>gain.disconnect();return;}
    const notes=kind==='bell'?[523.25,783.99]:kind==='beep'?[880,880,880]:[523.25,659.25,783.99];
    notes.forEach((frequency,i)=>{const node=ctx.createOscillator();const envelope=ctx.createGain();node.type='sine';node.frequency.value=frequency;node.connect(envelope);envelope.connect(gain);const start=ctx.currentTime+i*.35;envelope.gain.setValueAtTime(0,start);envelope.gain.linearRampToValueAtTime(.3,start+.025);envelope.gain.exponentialRampToValueAtTime(.001,start+.65);node.start(start);node.stop(start+.7);this.nodes.push(node);if(i===notes.length-1)node.onended=()=>gain.disconnect();});
  }
  close(){this.stop();void this.context?.close();this.context=undefined;}
}
