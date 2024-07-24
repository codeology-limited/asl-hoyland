
export interface ProgramItem {
  channel: number;
  frequency: number;
  runTime: number;
}

export interface Program {
  name: string;
  range: boolean;
  data: ProgramItem[];
  maxTimeInMinutes: number;
  default: boolean;
}
