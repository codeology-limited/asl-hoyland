// src/types.ts
export interface ProgramItem {
    channel: number;
    frequency: number | string;
    runTime: number;
    sweepTo?: number;
}

export interface Program {
    id?: number;
    name: string;
    range: boolean;
    data: ProgramItem[];
    maxTimeInMinutes: number;
    default: number | boolean;
    startFrequency: number;

    channel1wavetype?: string;
    channel2wavetype?: string;
    onkeysec?: number;
    offkeysec?: number;
    sliderMinV?: number;
    sliderMaxV?: number;
    sliderStepV?: number;
    sliderPercent?: number;
    startIntensityV?: number;
    mirror?: number | boolean;
}
