import { Plugin } from 'obsidian';
import { DeepestSettingTab } from './SettingsTab';
import { DeepestSettings, DEFAULT_SETTINGS } from './settings';
import '../styles.css'; // Import the CSS file
import { ResearchView, RESEARCH_VIEW_TYPE } from './views/ResearchView';

export default class DeepestPlugin extends Plugin {
    // Initialize settings with default values
    settings: DeepestSettings = DEFAULT_SETTINGS;

    async onload() {
        await this.loadSettings();
        
        // Add settings tab
        this.addSettingTab(new DeepestSettingTab(this.app, this));

        this.registerView(
            RESEARCH_VIEW_TYPE,
            (leaf) => new ResearchView(leaf)
        );

        this.addRibbonIcon('search', 'Open Research View', () => {
            this.activateView();
        });
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    onunload() {
        console.log('Deepest plugin unloaded');
    }

    async activateView() {
        const { workspace } = this.app;
        let leaf = workspace.getRightLeaf(false);
        
        if (!leaf) {
            return; // Exit if we can't create a leaf
        }
        
        await leaf.setViewState({
            type: RESEARCH_VIEW_TYPE,
            active: true,
        });
        
        workspace.revealLeaf(leaf);
    }
} 