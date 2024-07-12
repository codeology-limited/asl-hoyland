export interface ProgramItem {
  frequency: number;
  runTime: number;
}

export interface Program {
  name: string;
  data: ProgramItem[];
  runTimeInMinutes: number;
}