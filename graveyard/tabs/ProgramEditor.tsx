import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';
import { Program, ProgramItem } from '../types.ts';

interface ProgramEditorProps {
  onSave: (programName: string, programData: ProgramItem[], programMaxTime: number, range: boolean) => void;
  onCancel: () => void;
  programs: Program[];
  loadProgramData: (programName: string) => Promise<Program>;
}

const ProgramEditor: React.FC<ProgramEditorProps> = ({ onSave, onCancel, programs, loadProgramData }) => {
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
      setProgramData([...programData, { channel: currentChannel, frequency: currentFrequency, runTime: currentRunTime }]);
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
        <div className="program-toolbar">
          <select value={selectedProgram} onChange={handleProgramSelect}>
            <option value="">Choose existing or create a new Program</option>
            {programs.map((program) => (
                <option key={program.name} value={program.name}>{program.name}</option>
            ))}
          </select>
          <button type="button" onClick={resetForm}>New Program</button>
        </div>
        <div className="program-toolbar">
          <label>
            Program Name:
            <input
                type="text"
                value={programName}
                onChange={(e) => setProgramName(e.target.value)}
                placeholder="Enter program name"
            />
          </label>
        </div>
        <div className="program-toolbar">
          <label>
            Range:
            <input
                type="checkbox"
                checked={range}
                onChange={(e) => setRange(e.target.checked)}
            />
          </label>
        </div>
        <div className="add program-toolbar">
          <label>
            Channel:
            <input
                type="number"
                value={currentChannel}
                onChange={(e) => setCurrentChannel(Number(e.target.value))}
                min="1"
            />
          </label>
          <label>
            Frequency (Hz):
            <input
                type="number"
                value={currentFrequency}
                onChange={(e) => setCurrentFrequency(Number(e.target.value))}
                min="0"
            />
          </label>
          <label>
            Run Time (ms):
            <input
                type="number"
                value={currentRunTime}
                onChange={(e) => setCurrentRunTime(Number(e.target.value))}
                min="1"
            />
          </label>
          <button onClick={addProgramItem} className="add-frequency-btn">Add</button>
        </div>
        <div className="program-toolbar">
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="program-items">
              {(provided) => (
                  <table className="program-table" {...provided.droppableProps} ref={provided.innerRef}>
                    <thead>
                    <tr>
                      <th>Channel</th>
                      <th>Frequency (Hz)</th>
                      <th>Run Time (ms)</th>
                      <th>Action</th>
                    </tr>
                    </thead>
                    <tbody>
                    {programData.map((item, index) => (
                        <Draggable key={index} draggableId={`item-${index}`} index={index}>
                          {(provided) => (
                              <tr
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                              >
                                <td>{item.channel}</td>
                                <td>{item.frequency}</td>
                                <td>{item.runTime}</td>
                                <td>
                                  <button onClick={() => deleteItem(index)} className="delete-btn">X</button>
                                </td>
                              </tr>
                          )}
                        </Draggable>
                    ))}
                    {provided.placeholder}
                    </tbody>
                  </table>
              )}
            </Droppable>
          </DragDropContext>
        </div>
        <div className="program-toolbar">
          <div className="button-group">
            <button type="button" onClick={handleSave}>Save</button>
            <button type="button" onClick={onCancel}>Cancel</button>
          </div>
        </div>
      </div>
  );
};

export default ProgramEditor;
