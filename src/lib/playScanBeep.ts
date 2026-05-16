import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';

const beepSource = require('@/assets/sounds/scan-beep.wav');

let modeReady = false;
let sound: Audio.Sound | null = null;

/** Bip curto após leitura válida (semelhante a leitor USB). Falha silenciosamente se o áudio não estiver disponível. */
export async function playScanBeep(): Promise<void> {
  try {
    if (!modeReady) {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        allowsRecordingIOS: false,
        staysActiveInBackground: false,
        interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
        interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      modeReady = true;
    }
    if (!sound) {
      const { sound: s } = await Audio.Sound.createAsync(beepSource, {
        shouldPlay: false,
        volume: 0.88,
        isLooping: false,
      });
      sound = s;
    }
    await sound.replayAsync();
  } catch {
    /* sem som — o scan continua válido */
  }
}
