import { invoke } from "@tauri-apps/api/tauri";

class HoylandController {
  intensity: number = 1;
  setStatus

  constructor(setStatus: (status: 'success' | 'fail' | null ) => void) {
    this.intensity = 1; // Initialize intensity with a default value
    this.setStatus = async function( status:'success' | 'fail' | null ){
      setStatus(null)
       // await new Promise(resolve => setTimeout(resolve, 1000))
       // setStatus(status)

  }
  }


  async  reconnectDevice():Promise<string> {

    try {
      const targetDevice = "Hoyland"; // Replace with the actual target device name
      const baudRate = 115200; // Use the correct baud rate

      const result = await invoke('reconnect_device', {args:{
        target_device: targetDevice,
        baud_rate: baudRate,
      }});



      console.log("Reconnected:", result);
      await this.setStatus("success")

      return result as string
    } catch (error) {
      console.error("Failed to reconnect device:", error);
      this.setStatus("fail")


      return ""
    }
  }



  async sendInitialCommands() {
    try {
      const result = await invoke('send_initial_commands');
      await new Promise(resolve => setTimeout(resolve, 300))
      if (result) {
        console.log('Initial commands sent successfully');
        await this.setStatus("success")
      } else {
        console.error('Failed to send initial commands');
        this.setStatus("fail")
      }
    } catch (error) {
      console.error('Error sending initial commands:', error);
      this.setStatus("fail")
    }
  }

  async setWaveform(channel: number, waveformType: number) {
    const args = {
      channel: channel,
      waveform_type: waveformType,
    };

    try {
      await invoke('set_waveform', { args });
      await new Promise(resolve => setTimeout(resolve, 300))
      console.log(`Waveform set for channel ${channel} to type ${waveformType}`);
      await this.setStatus("success")
    } catch (error) {
      console.error(`Error setting waveform: ${error}`);
      this.setStatus("fail")
    }
  }

  async setFrequency(channel: number, frequency: number) {
    const args = {
      channel: channel,
      frequency: frequency,
    };

    try {
      await invoke('set_frequency', { args });
      await new Promise(resolve => setTimeout(resolve, 300))
      console.log(`Frequency set for channel ${channel} to ${frequency} MHz`);
      await this.setStatus("success")
    } catch (error) {
      console.error(`Error setting frequency: ${error}`);
      this.setStatus("fail")
    }
  }

  async setAmplitude(channel: number, amplitude: number) {
    const args = {
      channel: channel,
      amplitude: amplitude,
    };

    try {
      console.log('Invoking set_amplitude with args:', args);
      await invoke('set_amplitude', { args });
      await new Promise(resolve => setTimeout(resolve, 300))
      console.log(`Amplitude set to ${amplitude} for channel ${channel}`);
      await this.setStatus("success")
    } catch (error) {
      console.error('Error setting amplitude:', error);
      this.setStatus("fail")
    }
  }

  async setOffset(channel: number, offset: number) {
    const args = {
      channel: channel,
      offset: offset,
    };

    try {
      await invoke('set_offset', { args });
      await new Promise(resolve => setTimeout(resolve, 300))
      console.log(`Offset set to ${offset} for channel ${channel}`);
      await this.setStatus("success")
    } catch (error) {
      console.error('Error setting offset:', error);
      this.setStatus("fail")
    }
  }

  async setDutyCycle(channel: number, dutyCycle: number) {
    const args = {
      channel: channel,
      duty_cycle: dutyCycle,
    };

    try {
      await invoke('set_duty_cycle', { args });
      await new Promise(resolve => setTimeout(resolve, 300))
      console.log(`Duty cycle set to ${dutyCycle}% for channel ${channel}`);
      await this.setStatus("success")
    } catch (error) {
      console.error('Error setting duty cycle:', error);
      this.setStatus("fail")
    }
  }

  async setPhase(channel: number, phase: number) {
    const args = {
      channel: channel,
      phase: phase,
    };

    try {
      await invoke('set_phase', { args });
      await new Promise(resolve => setTimeout(resolve, 300))
      console.log(`Phase set to ${phase} degrees for channel ${channel}`);
      await this.setStatus("success")
    } catch (error) {
      console.error('Error setting phase:', error);
      this.setStatus("fail")
    }
  }

  async setAttenuation(channel: number, attenuation: number) {
    const args = {
      channel: channel,
      attenuation: attenuation,
    };

    try {
      await invoke('set_attenuation', { args });
      await new Promise(resolve => setTimeout(resolve, 300))
      console.log(`Attenuation set to ${attenuation} for channel ${channel}`);
      await this.setStatus("success")
    } catch (error) {
      console.error('Error setting attenuation:', error);
      this.setStatus("fail")
    }
  }

  async synchroniseVoltage() {
    try {
      await invoke('synchronise_voltage', {});
      await new Promise(resolve => setTimeout(resolve, 300))
      console.log('Voltage output synchronized');
      await this.setStatus("success")
    } catch (error) {
      console.error('Error synchronizing voltage output:', error);
      this.setStatus("fail")

    }
  }

  async enableOutput(channel: number, enable: boolean) {
    const args = {
      channel: channel,
      enable: enable,
    };

    try {
      console.log('Invoking enable_output with args:', args);
      await invoke('enable_output', { args });
      await new Promise(resolve => setTimeout(resolve, 300))
      console.log(`Output ${enable ? 'enabled' : 'disabled'} for channel ${channel}`);
      await this.setStatus("success")
    } catch (error) {
      console.error('Error enabling output:', error);
      this.setStatus("fail")
    }
  }

  async sendFrequency(channel: number, frequency: number, amplitude: number) {
    try {
      if (channel === 1) {
        await this.setWaveform(1, 1); // Ensure Channel 1 is set to square wave
      } else if (channel === 2) {
        await this.setWaveform(2, 0); // Ensure Channel 2 is set to sine wave
      }

      await new Promise(resolve => setTimeout(resolve, 300))
      await this.setFrequency(channel, frequency);
      await new Promise(resolve => setTimeout(resolve, 300))

      await this.setAmplitude(channel, amplitude);
      await new Promise(resolve => setTimeout(resolve, 300))


      console.log(`Frequency and amplitude set for channel ${channel}`);
      await this.setStatus("success")
    } catch (error) {
      console.error('Error sending frequency:', error);
      this.setStatus("fail")
    }
  }

  async stop() {
    try {
      await this.enableOutput(1, false);
      await new Promise(resolve => setTimeout(resolve, 300))
      await this.enableOutput(2, false);
      await new Promise(resolve => setTimeout(resolve, 300))
      console.log('Output stopped for all channels');
      await this.setStatus("success")

    } catch (error) {
      console.error('Error stopping output:', error);
      this.setStatus("fail")
    }
  }

  async stopAndReset() {
    try {
      const result = await invoke('stop_and_reset');
      if (result) {
        console.log('Stop and reset commands sent successfully');
        await this.setStatus("success")
      } else {
        console.error('Failed to send stop and reset commands');
        this.setStatus("fail")
      }
    } catch (error) {
      console.error('Error sending stop and reset commands:', error);
      this.setStatus("fail")
    }
  }
}

export default HoylandController;
