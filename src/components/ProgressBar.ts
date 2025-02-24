export class ProgressBar {
    private container: HTMLElement;
    private progressBar: HTMLElement;
    private phaseLabel: HTMLElement;
    private detailLabel: HTMLElement;

    constructor(container: HTMLElement) {
        this.container = container.createEl('div', { cls: 'research-progress' });
        
        const progressContainer = this.container.createEl('div', { cls: 'progress-container' });
        this.progressBar = progressContainer.createEl('div', { cls: 'progress-bar' });
        
        const labelContainer = this.container.createEl('div', { cls: 'progress-labels' });
        this.phaseLabel = labelContainer.createEl('div', { 
            cls: 'phase-label',
            text: 'Initializing...'
        });
        this.detailLabel = labelContainer.createEl('div', { 
            cls: 'detail-label',
            text: 'Getting ready...'
        });
    }

    update(progress: ProgressUpdate) {
        this.progressBar.style.width = `${progress.totalProgress}%`;
        this.phaseLabel.setText(
            `${progress.step.phase} (${progress.step.current}/${progress.step.total})`
        );
        this.detailLabel.setText(progress.step.detail || '');
    }
} 