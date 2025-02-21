import { Plugin } from 'obsidian';

export default class DeepestPlugin extends Plugin {
    async onload() {
        console.log('Deepest plugin loaded');
    }

    onunload() {
        console.log('Deepest plugin unloaded');
    }
} 