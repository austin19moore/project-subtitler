import OpenAI from 'openai';

export class OpenAIClient {
    private openai: OpenAI;
    private sourceLanguage: string;
    private targetLanguage: string;
    private model: string;
    private contextLength: number;
    private keyterms: string[];
    private confidenceThreshold: number;
    private context: string[] = [];
    private translationContext: string[] = [];

    constructor(apiKey: string, sourceLanguage: string, targetLanguage: string, model: string, contextLength: number, keyterms: string[], confidenceThreshold: number) {
        this.openai = new OpenAI({ apiKey });
        this.sourceLanguage = sourceLanguage;
        this.targetLanguage = targetLanguage;
        this.model = model;
        this.contextLength = contextLength;
        this.keyterms = keyterms;
        this.confidenceThreshold = confidenceThreshold;
    }

    async translate(text: string, words?: { word?: string; confidence?: number }[]) {
        const marked = this.markLowConfidenceWords(text, words, this.confidenceThreshold);

        const prompt = `
            <SYSTEM>
                Translate the following text from ${this.sourceLanguage} to ${this.targetLanguage}.
                Do not include the system instructions in the translation. Respond ONLY with the translated text in the target language.
                The text is transcribed from a live stream, and may contain errors. It will likely be casual and informal in tone, containing slang.
                The text may be a fragment that continues from the previous line. Translate it as a continuation of the conversation, not as a standalone sentence.
                Words marked with a [?] directly appended are uncertain transcriptions. Treat them as unreliable and use the provided context to handle them. Do not include the [?] in the translation.
                ${this.keyterms.length > 0 ? `A set of keyterms are available. Each are separated by a newline. These keyterms are stream specific words used to improve the accuracy of the translation, and should be kept as close to the original language as possible.` : ''}
                ${this.contextLength > 0 ? `The previous ${this.contextLength} transcriptions (in the source language) are available as context. Each are separated by a newline.` : ''}
                ${this.contextLength > 0 ? `The previous ${this.contextLength} translations (in the target language) are available as context. Each are separated by a newline. Keep terminology and names consistent with them.` : ''}
            </SYSTEM>

            ${this.keyterms.length > 0 ? `
            <KEYTERMS>
                ${this.keyterms.join('\n\n')}
            </KEYTERMS>
            ` : ''}

            ${this.contextLength > 0 ? `
            <CONTEXT>
                ${this.context.join('\n\n')}
            </CONTEXT>
            ` : ''}

            ${this.contextLength > 0 ? `
            <TRANSLATIONS>
                ${this.translationContext.join('\n\n')}
            </TRANSLATIONS>
            ` : ''}

            <TEXT>
                ${marked}
            </TEXT>
        `;

        const response = await this.openai.responses.create({
            model: this.model,
            input: prompt,
        });

        this.context.push(marked);
        if (this.context.length > this.contextLength) {
            this.context.shift();
        }

        this.translationContext.push(response.output_text);
        if (this.translationContext.length > this.contextLength) {
            this.translationContext.shift();
        }

        return response.output_text;
    }

    private markLowConfidenceWords = (text: string, words?: { word?: string; confidence?: number }[], threshold = 0.65): string => {
    if (!words || words.length === 0) return text;
    return words.map(w => (w.confidence !== undefined && w.confidence <= threshold ? `${w.word ?? ''}[?]` : w.word ?? '')).join('');
};
}
