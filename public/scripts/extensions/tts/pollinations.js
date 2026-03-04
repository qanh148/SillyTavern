import { getRequestHeaders } from '../../../script.js';
import { splitRecursive } from '../../utils.js';
import { getPreviewString, saveTtsProviderSettings } from './index.js';

export class PollinationsTtsProvider {
    settings;
    voices = [];
    separator = ' . ';
    audioElement = document.createElement('audio');

    defaultSettings = {
        // TODO: Make this configurable
        model: 'openai-audio',
        voiceMap: {},
    };



    get settingsHtml() {
        return `
        <div id="pollinations-tts-settings">
            <div>
                <label for="pollinations-tts-model">Model:</label>
                <select id="pollinations-tts-model">
                    <option value="openai-audio">OpenAI Audio</option>
                </select>
            </div>
        </div>`;
    }

    onSettingsChange() {
        this.voices = [];
        saveTtsProviderSettings();
    }

    async loadSettings(settings) {
        // Populate Provider UI given input settings
        if (Object.keys(settings).length == 0) {
            console.info('Using default TTS Provider settings');
        }

        // Only accept keys defined in defaultSettings
        this.settings = Object.assign({}, this.defaultSettings);

        for (const key in settings) {
            if (key in this.settings) {
                this.settings[key] = settings[key];
            } else {
                console.warn(`Invalid setting passed to TTS Provider: ${key}`);
            }
        }

        try {
            await this.populateModels();

            const modelSelect = document.getElementById('pollinations-tts-model');
            if (modelSelect) {
                modelSelect.value = this.settings.model;
                modelSelect.addEventListener('change', () => {
                    this.settings.model = modelSelect.value;
                    this.onSettingsChange();
                });
            }

            await this.checkReady();
            console.debug('Pollinations TTS: Settings loaded');
        } catch {
            console.debug('Pollinations TTS: Settings loaded, but not ready');
        }
    }

    async populateModels() {
        try {
            const response = await fetch('https://gen.pollinations.ai/audio/models');
            if (!response.ok) {
                throw new Error('Failed to fetch Pollinations models');
            }
            const models = await response.json();

            const select = document.getElementById('pollinations-tts-model');
            if (!select) return;

            select.innerHTML = '';
            models.forEach(model => {
                const option = document.createElement('option');
                option.value = model.name;
                option.textContent = model.name;
                select.appendChild(option);
            });

            // If current model is not in the list, fallback to the first model
            if (models.length > 0 && !models.find(m => m.name === this.settings.model)) {
                this.settings.model = models[0].name;
                if (select) select.value = this.settings.model;
            }
        } catch (error) {
            console.error('Error fetching Pollinations TTS models:', error);
            const select = document.getElementById('pollinations-tts-model');
            if (select && select.children.length === 0) {
                const option = document.createElement('option');
                option.value = 'openai-audio';
                option.textContent = 'OpenAI Audio';
                select.appendChild(option);
            }
        }
    }

    // Perform a simple readiness check by trying to fetch voiceIds
    async checkReady() {
        await this.fetchTtsVoiceObjects();
    }

    async onRefreshClick() {
        await this.checkReady();
    }

    //#################//
    //  TTS Interfaces //
    //#################//

    async getVoice(voiceName) {
        if (this.voices.length == 0) {
            this.voices = await this.fetchTtsVoiceObjects();
        }
        const match = this.voices.filter(
            voice => voice.name == voiceName || voice.voice_id == voiceName,
        )[0];
        if (!match) {
            throw `TTS Voice name ${voiceName} not found`;
        }
        return match;
    }

    /**
     * Generate TTS audio for the given text using the specified voice.
     * @param {string} text Text to generate
     * @param {string} voiceId Voice ID
     * @returns {AsyncGenerator<Response>} Audio response generator
     */
    generateTts(text, voiceId) {
        return this.fetchTtsGeneration(text, voiceId);
    }

    //###########//
    // API CALLS //
    //###########//
    async fetchTtsVoiceObjects() {
        var voiceList = ["alloy", "echo", "fable", "onyx", "nova", "shimmer", "ash", "ballad", "coral", "sage", "verse", "rachel", "domi", "bella", "elli", "charlotte", "dorothy", "sarah", "emily", "lily", "matilda", "adam", "antoni", "arnold", "josh", "sam", "daniel", "charlie", "james", "fin", "callum", "liam", "george", "brian", "bill"]
        return voiceList
            .sort()
            .map(x => ({ name: x, voice_id: x, preview_url: false, lang: 'en-US' }));
    }

    /**
     * Preview TTS for a given voice ID.
     * @param {string} id Voice ID
     */
    async previewTtsVoice(id) {
        this.audioElement.pause();
        this.audioElement.currentTime = 0;
        const voice = await this.getVoice(id);
        const text = getPreviewString(voice.lang);
        for await (const response of this.generateTts(text, id)) {
            const audio = await response.blob();
            const url = URL.createObjectURL(audio);
            await new Promise(resolve => {
                const audioElement = new Audio();
                audioElement.src = url;
                audioElement.play();
                audioElement.onended = () => resolve();
            });
            URL.revokeObjectURL(url);
        }
    }

    async* fetchTtsGeneration(text, voiceId) {
        const MAX_LENGTH = 1000;
        console.info(`Generating new TTS for voice_id ${voiceId}`);
        const chunks = splitRecursive(text, MAX_LENGTH);
        for (const chunk of chunks) {
            const response = await fetch('/api/speech/pollinations/generate', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({
                    model: this.settings.model,
                    text: chunk,
                    voice: voiceId,
                }),
            });

            if (!response.ok) {
                toastr.error(response.statusText, 'TTS Generation Failed');
                throw new Error(`HTTP ${response.status}: ${await response.text()}`);
            }

            yield response;
        }
    }
}
