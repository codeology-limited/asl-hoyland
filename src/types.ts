// src/types.ts
export interface ProgramItem {
    channel: number;
    frequency: number;
    runTime: number;
}

export interface Program {
    id?: number;
    name: string;
    range: boolean;
    data: ProgramItem[];
    maxTimeInMinutes: number;
    default: number | boolean;
    startFrequency: number;  // Add this line
}
