import { App, Plugin, PluginSettingTab, Setting, Notice } from 'obsidian';
import { DeepestSettings, DEFAULT_SETTINGS } from './settings';
import { ProviderFactory } from './providers/ProviderFactory';
import DeepestPlugin from './main';

export class DeepestSettingTab extends PluginSettingTab {
    private plugin: DeepestPlugin;
    private settings: DeepestSettings;

    constructor(app: App, plugin: DeepestPlugin) {
        super(app, plugin);
        this.plugin = plugin;
        this.settings = plugin.settings;
    }

    async display(): Promise<void> {
        const { containerEl } = this;
        containerEl.empty();

        // LLM Section
        containerEl.createEl('h2', { text: 'LLM settings' });

        const llmSettingsContainer = containerEl.createDiv('llm-settings-group');

        new Setting(llmSettingsContainer)
            .setName('LLM provider')
            .setDesc('Select your preferred LLM provider')
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'lmstudio': 'LM Studio',
                    'openrouter': 'OpenRouter'
                })
                .setValue(this.settings.selectedLLMProvider)
                .onChange(async (value) => {
                    this.settings.selectedLLMProvider = value as 'lmstudio' | 'openrouter';
                    await this.plugin.saveSettings();
                    this.display();
                }));

        // LLM Provider Specific Settings
        if (this.settings.selectedLLMProvider === 'openrouter') {
            new Setting(llmSettingsContainer)
                .setName('OpenRouter API Key')
                .setDesc('Enter your OpenRouter API key')
                .addText(text => text
                    .setValue(this.settings.openrouterApiKey)
                    .onChange(async (value) => {
                        this.settings.openrouterApiKey = value;
                        await this.plugin.saveSettings();
                        // Refresh model list when API key changes
                        this.refreshOpenRouterModels();
                    }));

            // Model Selection
            const modelSetting = new Setting(llmSettingsContainer)
                .setName('Model')
                .setDesc('Select the OpenRouter model to use')
                .addDropdown(dropdown => {
                    dropdown.addOption('loading', 'Loading models...');
                    
                    // Load models after dropdown is created
                    const provider = ProviderFactory.createLLMProvider(this.settings);
                    if (provider) {
                        provider.getModels().then(models => {
                            dropdown.selectEl.empty();
                            models.forEach(model => dropdown.addOption(model, model));
                            dropdown.setValue(this.settings.selectedModel);
                        }).catch(error => {
                            dropdown.selectEl.empty();
                            dropdown.addOption('error', 'Error loading models');
                            console.error('Failed to load OpenRouter models:', error);
                        });
                    }

                    dropdown.onChange(async value => {
                        this.settings.selectedModel = value;
                        await this.plugin.saveSettings();
                    });

                    return dropdown;
                });
        }

        if (this.settings.selectedLLMProvider === 'lmstudio') {
            new Setting(llmSettingsContainer)
                .setName('LM Studio URL')
                .setDesc('Enter your LM Studio server URL')
                .addText(text => text
                    .setValue(this.settings.lmstudioUrl)
                    .onChange(async (value) => {
                        this.settings.lmstudioUrl = value;
                        await (this.plugin as any).saveSettings();
                    }));

            // Add model selection
            const provider = ProviderFactory.createLLMProvider(this.settings);
            if (provider) {
                try {
                    const models = await provider.getModels();
                    new Setting(llmSettingsContainer)
                        .setName('Model')
                        .setDesc('Select the model to use')
                        .addDropdown(dropdown => dropdown
                            .addOptions(Object.fromEntries(models.map(m => [m, m])))
                            .setValue(this.settings.selectedModel)
                            .onChange(async (value) => {
                                this.settings.selectedModel = value;
                                await (this.plugin as any).saveSettings();
                            }));
                } catch (error) {
                    new Setting(llmSettingsContainer)
                        .setName('Model')
                        .setDesc('Could not fetch models. Please check your LM Studio connection.');
                }
            }
        }

        // Helper function to create test button with status
        const createTestButton = (container: HTMLElement, buttonText: string, testFn: () => Promise<void>) => {
            const buttonContainer = container.createDiv('test-button-container');
            const statusEl = buttonContainer.createSpan('test-status-emoji');

            new Setting(buttonContainer)
                .setName('Test connection')
                .setDesc(`Test connection to ${this.settings.selectedLLMProvider.toUpperCase()}`)
                .addButton(button => button
                    .setButtonText(buttonText)
                    .onClick(async () => {
                        button.setDisabled(true);
                        statusEl.setText('🔄');
                        try {
                            await testFn();
                        } finally {
                            button.setDisabled(false);
                        }
                    }));

            return statusEl;
        };

        // LLM Test Button
        const llmStatusEl = createTestButton(llmSettingsContainer, 'Test LLM', async () => {
            const provider = ProviderFactory.createLLMProvider(this.settings);
            if (!provider) {
                llmStatusEl.setText('💩');
                new Notice('❌ No provider configured');
                return;
            }

            try {
                const success = await provider.testConnection();
                if (success) {
                    llmStatusEl.setText('😁');
                    new Notice('✅ Connection successful!');
                } else {
                    llmStatusEl.setText('💩');
                    new Notice('❌ Connection failed');
                }
            } catch (error) {
                console.error('Connection test failed:', error);
                llmStatusEl.setText('💩');
                new Notice(`❌ Connection error: ${(error as Error).message}`);
            }
        });

        // Common LLM Settings
        new Setting(llmSettingsContainer)
            .setName('Max tokens')
            .setDesc('Maximum number of tokens to generate (2000-50000)')
            .addSlider(slider => {
                const sliderContainer = containerEl.createEl('div', {
                    cls: 'slider-container'
                });
                
                const valueDisplay = sliderContainer.createEl('div', {
                    text: this.settings.maxTokens.toString(),
                    cls: 'slider-value-display'
                });
                
                const sliderEl = slider.sliderEl;
                
                // Show value when interacting with slider
                const showValue = () => sliderContainer.classList.add('show-value');
                const hideValue = () => sliderContainer.classList.remove('show-value');
                
                sliderEl.addEventListener('mousedown', showValue);
                sliderEl.addEventListener('touchstart', showValue);
                sliderEl.addEventListener('mouseup', hideValue);
                sliderEl.addEventListener('touchend', hideValue);
                sliderEl.addEventListener('mouseleave', hideValue);
                
                // Update value while dragging
                sliderEl.addEventListener('input', () => {
                    const value = parseFloat(sliderEl.value);
                    const min = parseFloat(sliderEl.min);
                    const max = parseFloat(sliderEl.max);
                    const percent = ((value - min) / (max - min)) * 100;
                    sliderContainer.style.setProperty('--slider-thumb-position', `${percent}%`);
                    valueDisplay.textContent = sliderEl.value;
                });
                
                slider
                    .setLimits(2000, 50000, 100)
                    .setValue(this.settings.maxTokens)
                    .onChange(async (value) => {
                        this.settings.maxTokens = value;
                        await (this.plugin as any).saveSettings();
                    });
            });

        new Setting(llmSettingsContainer)
            .setName('Temperature')
            .setDesc('Model temperature (0-1)')
            .addSlider(slider => {
                const sliderContainer = containerEl.createEl('div', {
                    cls: 'slider-container'
                });
                
                const valueDisplay = sliderContainer.createEl('div', {
                    text: this.settings.temperature.toFixed(2),
                    cls: 'slider-value-display'
                });
                
                const sliderEl = slider.sliderEl;
                
                // Show value when interacting with slider
                const showValue = () => sliderContainer.classList.add('show-value');
                const hideValue = () => sliderContainer.classList.remove('show-value');
                
                sliderEl.addEventListener('mousedown', showValue);
                sliderEl.addEventListener('touchstart', showValue);
                sliderEl.addEventListener('mouseup', hideValue);
                sliderEl.addEventListener('touchend', hideValue);
                sliderEl.addEventListener('mouseleave', hideValue);
                
                // Update value while dragging
                sliderEl.addEventListener('input', () => {
                    const value = parseFloat(sliderEl.value);
                    const min = parseFloat(sliderEl.min);
                    const max = parseFloat(sliderEl.max);
                    const percent = ((value - min) / (max - min)) * 100;
                    sliderContainer.style.setProperty('--slider-thumb-position', `${percent}%`);
                    valueDisplay.textContent = value.toFixed(2);
                });
                
                slider
                    .setLimits(0, 1, 0.01)
                    .setValue(this.settings.temperature)
                    .onChange(async (value) => {
                        this.settings.temperature = value;
                        await (this.plugin as any).saveSettings();
                    });
            });

        new Setting(llmSettingsContainer)
            .setName('Enable LLM Rate Limiting')
            .setDesc('Enable rate limiting for LLM API requests')
            .addToggle(toggle => toggle
                .setValue(this.settings.llmRateLimitEnabled)
                .onChange(async value => {
                    this.settings.llmRateLimitEnabled = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(llmSettingsContainer)
            .setName('LLM Rate Limit')
            .setDesc('Maximum LLM API requests per minute (0 for no limit)')
            .addSlider(slider => slider
                .setLimits(0, 500, 5)
                .setValue(this.settings.llmRateLimit)
                .setDynamicTooltip()
                .onChange(async value => {
                    this.settings.llmRateLimit = value;
                    await this.plugin.saveSettings();
                }));

        // Web Search Section
        containerEl.createEl('h2', { text: 'Web search settings' });

        const webSearchSettingsContainer = containerEl.createDiv('websearch-settings-group');

        new Setting(webSearchSettingsContainer)
            .setName('Web search provider')
            .setDesc('Select your preferred web search provider')
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'perplexity': 'Perplexity',
                    'tavily': 'Tavily'
                })
                .setValue(this.settings.selectedWebSearchProvider)
                .onChange(async (value) => {
                    this.settings.selectedWebSearchProvider = value;
                    await (this.plugin as any).saveSettings();
                    this.display();
                }));

        // Web Search Provider Specific Settings
        if (this.settings.selectedWebSearchProvider === 'perplexity') {
            new Setting(webSearchSettingsContainer)
                .setName('Perplexity API key')
                .setDesc('Enter your Perplexity API key')
                .addText(text => text
                    .setValue(this.settings.perplexityApiKey)
                    .onChange(async (value) => {
                        this.settings.perplexityApiKey = value;
                        await (this.plugin as any).saveSettings();
                    }));
        }

        if (this.settings.selectedWebSearchProvider === 'tavily') {
            new Setting(webSearchSettingsContainer)
                .setName('Tavily API key')
                .setDesc('Enter your Tavily API key')
                .addText(text => text
                    .setValue(this.settings.tavilyApiKey)
                    .onChange(async (value) => {
                        this.settings.tavilyApiKey = value;
                        await (this.plugin as any).saveSettings();
                    }));
        }

        // Web Search Test Button
        const searchStatusEl = createTestButton(webSearchSettingsContainer, 'Test Search', async () => {
            const provider = ProviderFactory.createWebSearchProvider(this.settings);
            if (!provider) {
                searchStatusEl.setText('💩');
                new Notice('❌ No provider configured');
                return;
            }

            try {
                const success = await provider.testConnection();
                if (success) {
                    searchStatusEl.setText('😁');
                    new Notice('✅ Connection successful!');
                } else {
                    searchStatusEl.setText('💩');
                    new Notice('❌ Connection failed');
                }
            } catch (error) {
                console.error('Connection test failed:', error);
                searchStatusEl.setText('💩');
                new Notice(`❌ Connection error: ${(error as Error).message}`);
            }
        });

        new Setting(webSearchSettingsContainer)
            .setName('Enable Search Rate Limiting')
            .setDesc('Enable rate limiting for web search requests')
            .addToggle(toggle => toggle
                .setValue(this.settings.webSearchRateLimitEnabled)
                .onChange(async value => {
                    this.settings.webSearchRateLimitEnabled = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(webSearchSettingsContainer)
            .setName('Web Search Rate Limit')
            .setDesc('Maximum web search requests per minute (0 for no limit)')
            .addSlider(slider => slider
                .setLimits(0, 500, 5)
                .setValue(this.settings.webSearchRateLimit)
                .setDynamicTooltip()
                .onChange(async value => {
                    this.settings.webSearchRateLimit = value;
                    await this.plugin.saveSettings();
                }));

        // Output Settings Section
        containerEl.createEl('h2', { text: 'Output settings' });

        new Setting(containerEl)
            .setName('Output folder')
            .setDesc('Folder to save Deepest reports')
            .addText(text => text
                .setValue(this.settings.outputFolder)
                .onChange(async (value) => {
                    this.settings.outputFolder = value;
                    await (this.plugin as any).saveSettings();
                }));

        new Setting(containerEl)
            .setName('Debug Mode')
            .setDesc('Enable debug logging to console')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.debugMode)
                .onChange(async (value) => {
                    this.plugin.settings.debugMode = value;
                    await this.plugin.saveSettings();
                }));
    }

    private async refreshOpenRouterModels() {
        const modelDropdown = this.containerEl.querySelector('.model-dropdown') as HTMLElement;
        if (modelDropdown) {
            const dropdown = modelDropdown.querySelector('select');
            if (dropdown) {
                dropdown.innerHTML = '<option value="loading">Loading models...</option>';
                
                try {
                    const provider = ProviderFactory.createLLMProvider(this.settings);
                    if (provider) {
                        const models = await provider.getModels();
                        dropdown.innerHTML = '';
                        models.forEach(model => {
                            const option = document.createElement('option');
                            option.value = model;
                            option.text = model;
                            dropdown.appendChild(option);
                        });
                        dropdown.value = this.settings.selectedModel;
                    }
                } catch (error) {
                    dropdown.innerHTML = '<option value="error">Error loading models</option>';
                    console.error('Failed to refresh OpenRouter models:', error);
                }
            }
        }
    }
} 