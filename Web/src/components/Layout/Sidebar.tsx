import React, { useState } from 'react';
import './Sidebar.css';
// import { Link } from 'react-router-dom';
import Logo from '../../public/Logo.svg';

const Sidebar: React.FC = () => {
    const [activeItem, setActiveItem] = useState('projects');

    const menuItems = [
        { id: 'homepage', label: 'Homepage',  },
        { id: 'projects', label: 'Projects', },
        { id: 'new-project', label: 'New Project', },
    ];

    return (
        <div className="sidebar">
            <div className="sidebar-header">
                <div className="logo">
                    <img src={Logo} alt="BIM Analyst Logo" />
                </div>
            </div>

            <nav className="sidebar-nav">
                {menuItems.map((item) => (
                    <button
                        key={item.id}
                        className={`nav-item ${activeItem === item.id ? 'active' : ''}`}
                        onClick={() => setActiveItem(item.id)}
                    >
                        
                        <span className="nav-label">{item.label}</span>
                    </button>
                ))}
            </nav>
        </div>
    );
};

export default Sidebar;
