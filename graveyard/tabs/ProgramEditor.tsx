import React, {useState, useEffect} from 'react';
import {DragDropContext, Droppable, Draggable, DropResult} from 'react-beautiful-dnd';
import {Program, ProgramItem} from '../types.ts';

interface ProgramEditorProps {
    onSave: (programName: string, programData: ProgramItem[], programMaxTime: number, range: boolean) => void;
    onCancel: () => void;
    programs: Program[];
    loadProgramData: (programName: string) => Promise<Program>;
}

const ProgramEditor: React.FC<ProgramEditorProps> = ({onSave, onCancel, programs, loadProgramData}) => {
    const [programName, setProgramName] = useState('');
    const [programData, setProgramData] = useState<ProgramItem[]>([]);
    const [currentChannel, setCurrentChannel] = useState<number>(1);
    const [currentFrequency, setCurrentFrequency] = useState<number>(0);
    const [currentRunTime, setCurrentRunTime] = useState<number>(1000);
    const [selectedProgram, setSelectedProgram] = useState<string>('');
    const [range, setRange] = useState<boolean>(false);

    useEffect(() => {
        if (selectedProgram) {
            loadProgramData(selectedProgram).then((program) => {
                setProgramName(program.name);
                setProgramData(program.data);
                setRange(program.range);
            });
        }
    }, [selectedProgram, loadProgramData]);

    const addProgramItem = () => {
        if (currentChannel > 0 && currentFrequency > 0 && currentRunTime > 0) {
            setProgramData([...programData, {
                channel: currentChannel,
                frequency: currentFrequency,
                runTime: currentRunTime
            }]);
            setCurrentChannel(1);
            setCurrentFrequency(0);
            setCurrentRunTime(1000);
        }
    };

    const deleteItem = (index: number) => {
        setProgramData(programData.filter((_, i) => i !== index));
    };

    const handleSave = () => {
        if (programName.trim() && programData.length > 0) {
            const totalRunTime = programData.reduce((acc, item) => acc + item.runTime, 0) / 60000;
            onSave(programName, programData, totalRunTime, range);
        }
    };

    const handleProgramSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedProgram(e.target.value);
    };

    const resetForm = () => {
        setProgramName('');
        setProgramData([]);
        setSelectedProgram('');
        setCurrentChannel(1);
        setCurrentFrequency(0);
        setCurrentRunTime(1000);
        setRange(false);
    };

    const onDragEnd = (result: DropResult) => {
        if (!result.destination) {
            return;
        }

        const items = Array.from(programData);
        const [reorderedItem] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, reorderedItem);

        setProgramData(items);
    };

    return (
        <div id="editor" className="tabBody editor">
            <h2>Edit Programs</h2>



        </div>
    );
};

export default ProgramEditor;
