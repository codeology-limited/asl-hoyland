export interface ProgramItem {
    channel: number;
    frequency: number | string;
    runTime: number;
}

export interface Program {
    id?: number;
    name: string;
    range: boolean;
    data: ProgramItem[];
    maxTimeInMinutes: number;
    default: number | boolean;
    startFrequency: number;
    minAmplitude?: number;
    maxAmplitude?: number;
    initialAmplitude?: number;
}