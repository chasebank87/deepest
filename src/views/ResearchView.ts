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
    private researchManager: ResearchManager;
    private progressBar: ProgressBar;
    
    // State management
    private currentTopic: string = '';
    private currentQuestions: string[] = [];
    private currentQuestionIndex: number = 0;
    private answers: ResearchAnswer[] = [];

    private breadth: number = 5;
    private depth: number = 3;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
        // Create ResearchManager and pass this view instance
        this.researchManager = new ResearchManager(
            (this.app as any).plugins.plugins['deepest'].settings,
            this
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
        
        // Main container with centered content
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

        // Create a container for both the question section and initial message
        const contentSection = mainContainer.createEl('div', { cls: 'research-content-section' });

        // Question section (hidden initially)
        this.questionSection = contentSection.createEl('div', { cls: 'research-question-section' });
        
        // Initial message
        this.initialMessage = contentSection.createEl('div', { cls: 'research-initial-message' });
        this.initialMessage.createEl('p', { 
            text: 'Enter a topic above to start your research journey',
            cls: 'message-text'
        });

        // Create progress bar (initially hidden)
        this.progressBar = new ProgressBar(mainContainer);

        // Add event listeners
        this.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.handleSearch();
            }
        });
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
            
            // Show progress bar after animation
            setTimeout(() => {
                this.progressBar.container.addClass('visible');
            }, 500);

            // Start deep research
            const researchData = await this.researchManager.deepResearch(
                this.currentTopic,
                this.answers,
                this.depth,
                this.breadth
            );
            
            // Handle research completion
            // We'll add this later

        } catch (error) {
            new Notice(`Error: ${(error as Error).message}`);
        }
    }

    // Add method to update progress
    updateProgress(progress: ProgressUpdate) {
        this.progressBar.update(progress);
    }

    async onClose() {
        // Nothing to clean up yet
    }
}