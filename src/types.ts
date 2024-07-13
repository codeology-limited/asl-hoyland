
// In types.ts or wherever ProgramItem is defined
export interface ProgramItem {
  channel: number;  // Add this line
  frequency: number;
  runTime: number;
}

export interface Program {
  name: string;
  data: ProgramItem[];
  runTimeInMinutes: number;
}

