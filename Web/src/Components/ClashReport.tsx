import React from 'react';
import './ClashReport.css';

const ClashReport: React.FC = () => {
    const categories = [
        { id: 1, name: 'Cat 1', count: 0 },
        { id: 2, name: 'Cat 2', count: 0 },
        { id: 3, name: 'Cat 3', count: 0 },
    ];

    return (
        <div className="clash-report">
            <h3 className="clash-title">Clash report</h3>
            <div className="clash-categories">
                {categories.map((cat) => (
                    <button key={cat.id} className="clash-category">
                        {cat.name}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default ClashReport;
