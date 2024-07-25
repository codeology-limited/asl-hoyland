import React from 'react';
import AppDatabase from './util/AppDatabase.ts';

const ClearDatabaseButton: React.FC = () => {
    const database = new AppDatabase();

    const handleClearDatabase = async () => {
        await database.clearDatabase();
        alert('Database cleared and default programs reloaded.');
    };

    return (
        <button onClick={handleClearDatabase}>Clear Database</button>
    );
};

export default ClearDatabaseButton;
