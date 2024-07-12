declare module 'serialport' {
    import { EventEmitter } from 'events';
  
    interface OpenOptions {
      baudRate?: number;
      dataBits?: 5 | 6 | 7 | 8;
      stopBits?: 1 | 1.5 | 2;
      parity?: 'none' | 'even' | 'mark' | 'odd' | 'space';
      rtscts?: boolean;
      xon?: boolean;
      xoff?: boolean;
      xany?: boolean;
      autoOpen?: boolean;
      lock?: boolean;
    }
  
    class SerialPort extends EventEmitter {
      constructor(path: string, options?: OpenOptions);
  
      open(callback?: (error: Error | null) => void): void;
      close(callback?: (error: Error | null) => void): void;
      write(data: Buffer | string, callback?: (error: Error | null) => void): void;
      on(event: 'data', callback: (data: Buffer) => void): this;
      on(event: 'error', callback: (error: Error) => void): this;
    }
  
    export = SerialPort;
  }
  