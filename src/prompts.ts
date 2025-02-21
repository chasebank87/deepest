export interface PromptTemplate {
    name: string;
    description: string;
    template: string;
}

export const SYSTEM_PROMPTS = {
    // System prompts will go here
} as const;

export const CHAT_PROMPTS = {
  FEEDBACK: (topic: string) => `
<prompt>You are a follow-up question generator. A user will provide a research topic. Produce exactly three concise questions (under 15 words each) aimed at clarifying the user's research goals, motivations, or desired knowledge about that topic. The questions must be directed toward the user's intentions or objectives rather than testing their knowledge. Return only the JSON array with no extra text or formatting.</prompt>

<input>${topic}</input>

<example_input>"Solar Energy"</example_input>

<example_output> [ "What specific insights do you hope to gain about solar energy?", "Is there a practical outcome you want from your solar energy research?", "Why is solar energy important for your project or interest area?" ] </example_output>
`
} as const;

export const RESEARCH_PROMPTS = {
    SECTIONS: (topic: string, feedback: { question: string; answer: string }[], breadth: number) => `
<prompt>You are a section generator for a research application. Each input will include a primary topic and user feedback (question-answer pairs). Your final sections should reflect about 65% emphasis on the main topic and 35% based on the user's specific interests and clarifications. Produce an ordered list (in a JSON array) of sections (minimum ${breadth}, maximum ${breadth + 2}) that thoroughly explores the primary subject while incorporating the provided feedback. Do not include sections labeled "Introduction," "Conclusion," or "Sources," as they will be handled elsewhere. Each section's label must be concise yet sufficiently descriptive. Return only the JSON array with no extra text or formatting.</prompt>

<input>${JSON.stringify({ topic, feedback })}</input>

<example_input> { "topic": "Quantum Computing", "feedback": [ { "question": "Which parts of quantum computing are you most interested in exploring?", "answer": "I want to understand quantum algorithms and their practical applications" }, { "question": "Are you looking for practical uses or general information on quantum computing?", "answer": "Mainly practical applications in cryptography and optimization" }, { "question": "How do you plan to apply what you learn from this research?", "answer": "I'm developing software that might benefit from quantum computing concepts" } ] } </example_input>

<example_output> [ "Key Principles and Terminology", "Quantum Algorithms and Their Structure", "Cryptographic Applications and Security", "Optimization Problems and Solutions", "Software Integration Approaches", "Current Hardware Limitations", "Future Development Roadmap" ] </example_output>

<parameters>
minimum sections: ${breadth}
maximum sections: ${breadth + 2}
</parameters>
`,
    
    TITLE: (topic: string, sections: string[]) => `
<prompt>You are a title generator for a research application. You will receive a research topic and a JSON array of sections that make up the report. Produce exactly one concise title that accurately captures the overall focus of the report. The title must not exceed 12 words, and you must return only this single title as plain text with no extra formatting or punctuation.</prompt>

<input>${JSON.stringify({ topic, sections })}</input>

<example_input> { "topic": "Quantum Computing", "sections": [ "Key Principles and Terminology", "Quantum Algorithms and Their Structure", "Cryptographic Applications and Security", "Optimization Problems and Solutions", "Software Integration Approaches", "Current Hardware Limitations", "Future Development Roadmap" ] } </example_input>

<example_output>Quantum Computing: Algorithms, Security, and Future Potential</example_output>
`,

    INTRO: (topic: string, sections: string[]) => `
<prompt>You are an introduction generator for a research application. You will receive a research topic and a JSON array of sections that make up the report. Based on this information, produce a single introduction that summarizes the topic, explains its importance, and briefly previews the sections. The introduction must be no more than 250 words in length, and you must return only the introduction text as plain text with no extra formatting or punctuation.</prompt>

<input>${JSON.stringify({ topic, sections })}</input>

<example_input> { "topic": "Quantum Computing", "sections": [ "Key Principles and Terminology", "Quantum Algorithms and Their Structure", "Cryptographic Applications and Security", "Optimization Problems and Solutions", "Software Integration Approaches", "Current Hardware Limitations", "Future Development Roadmap" ] } </example_input>

<example_output>This report examines quantum computing, a rapidly advancing field that merges physics and computer science. By exploring foundational principles, emerging algorithms, and potential security benefits, we uncover how quantum computing challenges traditional computational limits. Quantum technologies hold promise in areas such as cryptography, optimization, and innovative software design. Yet, scaling these systems remains a significant obstacle, with hardware reliability and error correction at the forefront of ongoing research. By reviewing each section, readers will gain a broad overview of key concepts, learn about practical approaches to implementation, and grasp the role of current research in shaping future breakthroughs. This introduction sets the stage for understanding quantum computing's power, complexities, and capacity to transform computational paradigms.</example_output>
`,

    SERP: (topic: string, section: string, breadth: number) => `
<prompt>You are a SERP query generator for a research application. You will receive a topic, a specific section related to that topic, and a desired breadth value. Based on these inputs, produce a JSON array of search queries that will help find valuable references and information. The number of queries in the JSON array should match the provided breadth value. Each query must be concise, focused, and clearly aligned with the given section. Return only the JSON array with no extra text or formatting.</prompt>

<input>${JSON.stringify({ topic, section, breadth })}</input>

<example_input> { "topic": "Quantum Computing", "section": "Key Principles and Terminology", "breadth": 5 } </example_input>

<example_output> [ "Introduction to quantum computing principles", "Basic quantum computing terminology and definitions", "Foundational physics concepts for quantum computing", "Beginner's guide to qubits and quantum states", "Quantum gates and basic circuit operations" ] </example_output>
`,

    LEARNING: (section: string, url: string, text: string) => `
<prompt>You are a learning extractor for a research application. You will receive a section title, a URL, and a text. Generate concise but complete learnings relevant to the section title by examining the text. Each learning must cite the given URL as its source. Return only a JSON array, where each element is a string containing the learning and its source, with no additional formatting or commentary.</prompt>

<rules>
- Each learning must be concise and to the point.
- Each learning must cite the given URL as its source.
- Each learning must be relevant to the section title.
- Each learning must be no more than 50 words.
</rules>

<input>${JSON.stringify({ section, url, text })}</input>

<example_input> { "section": "Key Principles and Terminology", "url": "https://example.com/quantum-principles", "text": "Quantum computing harnesses quantum phenomena like superposition and entanglement, enabling new ways to process data. Unlike classical bits, qubits can represent multiple states simultaneously, potentially delivering exponential speedups for certain problems." } </example_input>

<example_output> [ "Quantum computing uses superposition and entanglement to process data in novel ways [source: https://example.com/quantum-principles]", "Qubits can hold multiple states at once, offering exponential speed improvements for some tasks [source: https://example.com/quantum-principles]" ] </example_output>
`
} as const;

// Helper function to format prompts with consistent styling
export function formatPrompt(template: string, ...args: any[]): string {
    let result = template.trim();
    args.forEach((arg, i) => {
        result = result.replace(`{${i}}`, arg);
    });
    return result;
} 