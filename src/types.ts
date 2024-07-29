// src/types.ts
export interface ProgramItem {
    channel: number;
    frequency: number;
    runTime: number;
}

export interface Program {
    id?: number;
    name: string;
    range: boolean; // Ensure this is strictly boolean
    data: ProgramItem[];
    maxTimeInMinutes: number;
    default: number | boolean;
}
