// A read-only analyser on the existing media path. Playback/range ownership
// remains in audio-core; creation/resume occurs only during a play gesture.
export function createAudioSignal(audio) {
  const signal = { bands: new Float32Array(32), rms: 0, low: 0, mid: 0, high: 0, air: 0 };
  let context = null, source = null, analyser = null, frequency = null, waveform = null;
  let spans = [], disabled = false, closed = false;
  const clear = () => { signal.bands.fill(0); signal.rms = signal.low = signal.mid = signal.high = signal.air = 0; return signal; };
  function status(value) { audio.dataset.analysis = value; }
  async function ensure() {
    if (closed || disabled) return false;
    try {
      if (!context) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) { disabled = true; status('unavailable'); return false; }
        context = new AudioContextClass();
        analyser = context.createAnalyser();
        analyser.fftSize = 2048;
        analyser.minDecibels = -90;
        analyser.maxDecibels = -20;
        analyser.smoothingTimeConstant = .55;
        frequency = new Uint8Array(analyser.frequencyBinCount);
        waveform = new Float32Array(analyser.fftSize);
        const hzPerBin = context.sampleRate / analyser.fftSize;
        spans = Array.from({length:32}, (_, i) => {
          const lo = Math.max(1, Math.floor(50 * (8000 / 50) ** (i / 32) / hzPerBin));
          const hi = Math.min(frequency.length, Math.max(lo + 1, Math.ceil(50 * (8000 / 50) ** ((i + 1) / 32) / hzPerBin)));
          return [lo, hi];
        });
        audio.dataset.analysisRate = String(context.sampleRate);
        audio.dataset.analysisBins = String(analyser.frequencyBinCount);
      }
      if (context.state !== 'running') await context.resume();
      if (closed || context.state !== 'running') {status('unavailable');return false;}
      if (!source) {
        // Confirm output is available before replacing native media output.
        // Dry audio reaches destination independently of the analysis branch.
        source = context.createMediaElementSource(audio);
        source.connect(context.destination);
        source.connect(analyser);
      }
      status(context.state);
      return context.state === 'running';
    } catch {
      // If graph creation is unsupported before rerouting, native media remains
      // usable. A routed graph is kept connected; failure is visible in metadata.
      disabled = !source;
      status('unavailable');
      return false;
    }
  }
  function sample() {
    if (!analyser || context.state !== 'running' || audio.paused || audio.seeking || closed) return clear();
    analyser.getByteFrequencyData(frequency);
    analyser.getFloatTimeDomainData(waveform);
    for (let i = 0; i < spans.length; i++) {
      let sum = 0;
      const [lo, hi] = spans[i];
      for (let j = lo; j < hi; j++) sum += frequency[j];
      signal.bands[i] = sum / Math.max(1, hi - lo) / 255;
    }
    const average = (start, end) => {
      let sum = 0, count = 0;
      for (let i = 0; i < 32; i++) {
        const hz = 50 * (8000 / 50) ** ((i + .5) / 32);
        if (hz >= start && hz < end) { sum += signal.bands[i]; count++; }
      }
      return sum / Math.max(1, count);
    };
    let squares = 0;
    for (let i = 0; i < waveform.length; i++) squares += waveform[i] * waveform[i];
    signal.rms = Math.min(1, Math.sqrt(squares / waveform.length) * 6);
    signal.low = average(50, 250); signal.mid = average(250, 1600);
    signal.high = average(1600, 6000); signal.air = average(6000, 8001);
    return signal;
  }
  return { ensure, sample, signal, clear,
    destroy() { closed = true; clear(); source?.disconnect(); analyser?.disconnect(); context?.close().catch(() => {}); },
  };
}
