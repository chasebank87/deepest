import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import { ResearchManager } from '../managers/ResearchManager';
import { ProgressBar } from '../components/ProgressBar';
import { ResearchAnswer, ProgressUpdate } from '../types';

export const RESEARCH_VIEW_TYPE = 'deepest-research-view';

export class ResearchView extends ItemView {
    private searchInput: HTMLInputElement;
    private searchIcon: HTMLElement;
    private loadingSpinner: HTMLElement;
    private initialMessage: HTMLElement;
    private questionSection: HTMLElement;
    private currentSectionLabel: HTMLElement;
    private researchManager: ResearchManager;
    private progressBar: ProgressBar;
    private cancelButton: HTMLElement;
    private progressContainer: HTMLElement;
    
    // State management
    private currentTopic: string = '';
    private currentQuestions: string[] = [];
    private currentQuestionIndex: number = 0;
    private answers: ResearchAnswer[] = [];

    private breadth: number = 5;
    private depth: number = 3;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
        // Create ResearchManager and pass this view instance and app
        this.researchManager = new ResearchManager(
            (this.app as any).plugins.plugins['deepest'].settings,
            this,
            this.app
        );
    }

    getViewType(): string {
        return RESEARCH_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'Research';
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        
        const mainContainer = container.createEl('div', { cls: 'research-view' });

        // Logo/Title section
        const titleSection = mainContainer.createEl('div', { cls: 'research-title-section' });
        titleSection.createEl('h1', { text: 'Deepest', cls: 'research-title' });
        titleSection.createEl('p', { text: 'AI-Powered Research Assistant', cls: 'research-subtitle' });

        // Search section
        const searchSection = mainContainer.createEl('div', { cls: 'research-search-section' });
        
        // Add research controls
        const controlsContainer = searchSection.createEl('div', { cls: 'research-controls' });
        
        // Breadth control
        const breadthControl = controlsContainer.createEl('div', { cls: 'research-control' });
        breadthControl.createEl('span', { text: 'Breadth', cls: 'research-control-label' });
        const breadthValue = breadthControl.createEl('span', { 
            text: this.breadth.toString(), 
            cls: 'research-control-value',
            attr: { title: 'Number of main sections' }
        });
        breadthValue.addEventListener('click', () => {
            this.breadth = this.breadth % 10 + 1; // Cycle between 1-10
            breadthValue.textContent = this.breadth.toString();
        });

        // Depth control
        const depthControl = controlsContainer.createEl('div', { cls: 'research-control' });
        depthControl.createEl('span', { text: 'Depth', cls: 'research-control-label' });
        const depthValue = depthControl.createEl('span', { 
            text: this.depth.toString(), 
            cls: 'research-control-value',
            attr: { title: 'Depth of research per section' }
        });
        depthValue.addEventListener('click', () => {
            this.depth = this.depth % 10 + 1; // Cycle between 1-10
            depthValue.textContent = this.depth.toString();
        });

        // Search input container
        const searchContainer = searchSection.createEl('div', { cls: 'search-container' });
        
        // Search input with icon/button
        const searchInputWrapper = searchContainer.createEl('div', { cls: 'search-input-wrapper' });
        this.searchIcon = searchInputWrapper.createEl('span', { 
            cls: 'search-icon'
        });
        this.searchIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`;

        // Add click handler to the icon
        this.searchIcon.addEventListener('click', () => {
            this.handleSearch();
        });

        this.searchInput = searchInputWrapper.createEl('input', {
            cls: 'search-input',
            attr: { 
                type: 'text',
                placeholder: 'Enter your research query...'
            }
        });

        // Add loading spinner (initially hidden)
        this.loadingSpinner = searchInputWrapper.createEl('div', { 
            cls: 'loading-spinner'
        });

        // Question section (hidden initially)
        this.questionSection = mainContainer.createEl('div', { cls: 'research-question-section' });
        
        // Initial message
        this.initialMessage = mainContainer.createEl('div', { cls: 'research-initial-message' });
        this.initialMessage.createEl('p', { 
            text: 'Enter a topic above to start your research journey',
            cls: 'message-text'
        });

        // Create content section last
        const contentSection = this.createContentSection();
        mainContainer.appendChild(contentSection);

        // Add event listeners
        this.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.handleSearch();
            }
        });
    }

    private createContentSection() {
        // Create research content section
        const contentSection = this.containerEl.createEl('div', { 
            cls: 'research-content-section' 
        });

        // Create current section label
        this.currentSectionLabel = contentSection.createEl('div', { 
            cls: 'current-section-label'
        });

        // Create text span for section info
        const sectionText = this.currentSectionLabel.createSpan({
            cls: 'section-text'
        });

        // Create cancel button
        this.cancelButton = this.currentSectionLabel.createEl('button', {
            cls: 'research-cancel-button',
            attr: { 'aria-label': 'Cancel Research' }
        });
        this.cancelButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
        
        // Update click handler to use try/catch
        this.cancelButton.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                await this.handleCancel();
            } catch (error) {
                console.debug('Cancel button click error:', error);
                this.resetView();
            }
        });

        // Create progress container
        this.progressContainer = contentSection.createEl('div', { 
            cls: 'research-progress-container' 
        });
        
        // Initialize progress bar
        this.progressBar = new ProgressBar(this.progressContainer);

        return contentSection;
    }

    private async handleSearch() {
        const query = this.searchInput.value.trim();
        if (!query) return;

        try {
            // Show loading state
            this.searchInput.disabled = true;
            this.searchIcon.parentElement?.addClass('loading');
            this.loadingSpinner.addClass('visible');

            this.currentTopic = query;
            this.currentQuestions = await this.researchManager.getFeedbackQuestions(query);
            
            // Switch to completed state
            this.searchIcon.parentElement?.removeClass('loading');
            this.searchIcon.parentElement?.addClass('completed');
            this.loadingSpinner.removeClass('visible');

            // Reset answers state
            this.currentQuestionIndex = 0;
            this.answers = [];

            // Hide subtitle and initial message with slide animation
            const subtitle = this.containerEl.querySelector('.research-subtitle');
            subtitle?.addClass('hidden');
            this.initialMessage.addClass('hidden');

            // Show first question
            setTimeout(() => {
                this.questionSection.style.display = 'block';
                this.questionSection.offsetHeight; // Force reflow
                this.showQuestion(this.currentQuestions[0]);
            }, 300);

        } catch (error) {
            // Reset to initial state on error
            this.searchInput.disabled = false;
            this.searchIcon.parentElement?.removeClass('loading');
            this.searchIcon.parentElement?.removeClass('completed');
            this.loadingSpinner.removeClass('visible');
            
            new Notice(`Error: ${(error as Error).message}`);
        }
    }

    private showQuestion(question: string) {
        this.questionSection.empty();
        
        const questionContainer = this.questionSection.createEl('div', { cls: 'question-container' });
        questionContainer.createEl('div', { 
            text: question,
            cls: 'question-text'
        });

        const inputWrapper = questionContainer.createEl('div', { cls: 'question-input-wrapper' });
        const questionInput = inputWrapper.createEl('input', {
            cls: 'question-input',
            attr: {
                type: 'text',
                placeholder: 'Type your answer...'
            }
        });

        const submitIcon = inputWrapper.createEl('span', { cls: 'question-submit-icon' });
        
        // Function to update icon based on input state
        const updateIcon = (input: string) => {
            if (input.trim() === '') {
                submitIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-error)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
                submitIcon.addClass('error');
                submitIcon.removeClass('success');
            } else {
                submitIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`;
                submitIcon.addClass('success');
                submitIcon.removeClass('error');
            }
        };

        // Initial icon state
        updateIcon(questionInput.value);

        // Update icon on input
        questionInput.addEventListener('input', () => {
            updateIcon(questionInput.value);
        });

        const handleSubmit = () => {
            const answer = questionInput.value.trim();
            if (!answer) return;
            
            // Store the answer
            this.answers.push({
                question: this.currentQuestions[this.currentQuestionIndex],
                answer: answer
            });

            // Move to next question or finish
            this.currentQuestionIndex++;
            if (this.currentQuestionIndex < this.currentQuestions.length) {
                // Show next question with animation
                this.questionSection.removeClass('visible');
                setTimeout(() => {
                    this.showQuestion(this.currentQuestions[this.currentQuestionIndex]);
                    this.questionSection.addClass('visible');
                }, 300);
            } else {
                // Handle completion
                this.handleCompletion();
            }
        };

        submitIcon.addEventListener('click', handleSubmit);
        questionInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                handleSubmit();
            }
        });

        this.questionSection.addClass('visible');
        questionInput.focus();
    }

    private async handleCompletion() {
        try {
            // Add slide-out animation to question section
            this.questionSection.addClass('slide-out');
            
            // Wait for slide-out animation to complete
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Show content section with animation
            const contentSection = this.containerEl.querySelector('.research-content-section');
            if (contentSection) {
                contentSection.addClass('visible');
            }
            
            // Show progress elements with animation
            if (this.progressContainer) {
                this.progressContainer.removeClass('hidden');
                this.progressContainer.addClass('visible');
            }
            
            if (this.currentSectionLabel) {
                this.currentSectionLabel.removeClass('hidden');
                this.currentSectionLabel.addClass('visible');
            }

            // Show cancel button
            if (this.cancelButton) {
                this.cancelButton.removeClass('hidden');
            }
            
            // Start deep research
            const researchData = await this.researchManager.deepResearch(
                this.currentTopic,
                this.answers,
                this.depth,
                this.breadth
            );
            
            // Handle research completion
            // We'll add this later
            
            // Hide cancel button on completion
            this.cancelButton.addClass('hidden');
            
        } catch (error) {
            // Handle cancellation gracefully
            if (error instanceof Error && error.message === 'Research cancelled by user') {
                this.resetView();
                return;
            }
            
            // Handle other errors
            this.resetView();
            new Notice(`Research failed: ${(error as Error).message}`);
        }
    }

    private async handleCancel() {
        try {
            await this.researchManager.cancelResearch();
            
            // Hide content section
            const contentSection = this.containerEl.querySelector('.research-content-section');
            if (contentSection) {
                contentSection.removeClass('visible');
            }

            // Reset the view
            this.resetView();
            new Notice('Research cancelled');
        } catch (error) {
            console.error('Error during cancel:', error);
            this.resetView();
            new Notice(`Error cancelling research: ${(error as Error).message}`);
        }
    }

    private resetView() {
        // Show search elements
        this.searchInput?.removeClass('hidden');
        this.searchIcon?.removeClass('hidden');
        this.initialMessage?.removeClass('hidden');
        
        // Hide and reset progress elements
        if (this.progressContainer) {
            this.progressContainer.empty();
            this.progressContainer.removeClass('visible');
            this.progressContainer.addClass('hidden');
        }
        
        // Hide content section
        const contentSection = this.containerEl.querySelector('.research-content-section');
        if (contentSection) {
            contentSection.removeClass('visible');
        }
        
        if (this.currentSectionLabel) {
            this.currentSectionLabel.removeClass('visible');
            this.currentSectionLabel.addClass('hidden');
        }
        
        if (this.cancelButton) {
            this.cancelButton.addClass('hidden');
        }
        
        // Reset state
        this.currentTopic = '';
        this.answers = [];
        this.currentQuestions = [];
        this.currentQuestionIndex = 0;

        // Re-enable and clear input
        if (this.searchInput) {
            this.searchInput.disabled = false;
            this.searchInput.value = '';
        }
    }

    // Update section display with count
    updateCurrentSection(section: string, current: number, total: number) {
        if (!this.currentSectionLabel) return;
        
        const sectionText = this.currentSectionLabel.querySelector('.section-text');
        if (sectionText) {
            sectionText.textContent = `Current Section (${current}/${total}): ${section}`;
        }
        
        this.currentSectionLabel.style.display = 'flex';
        this.currentSectionLabel.style.opacity = '1';
        this.currentSectionLabel.style.visibility = 'visible';
    }

    // Update progress method
    updateProgress(progress: ProgressUpdate) {
        if (this.progressBar) {
            this.progressBar.update(progress);
        }
        
        // Update section label if available
        if (progress.step.phase && this.currentSectionLabel) {
            const sectionText = this.currentSectionLabel.querySelector('.section-text');
            if (sectionText) {
                sectionText.textContent = `${progress.step.phase} (${progress.step.current}/${progress.step.total})`;
            }
        }
    }

    async onClose() {
        // Nothing to clean up yet
    }

    private async startResearch() {
        try {
            // Hide search elements
            this.searchInput?.addClass('hidden');
            this.searchIcon?.addClass('hidden');
            this.initialMessage?.addClass('hidden');
            
            // Clear previous research state
            this.currentTopic = this.searchInput.value.trim();
            this.answers = [];
            
            // Start research
            const result = await this.researchManager.deepResearch(
                this.currentTopic,
                this.answers,
                this.depth,
                this.breadth
            );
            
        } catch (error) {
            new Notice(`Research failed: ${(error as Error).message}`);
            this.resetView();
        }
    }
}