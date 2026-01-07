Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const OPENAI_INTEGRATION_NAME = 'OpenAI';

// https://platform.openai.com/docs/quickstart?api-mode=responses
// https://platform.openai.com/docs/quickstart?api-mode=chat
const INSTRUMENTED_METHODS = ['responses.create', 'chat.completions.create'] ;

exports.INSTRUMENTED_METHODS = INSTRUMENTED_METHODS;
exports.OPENAI_INTEGRATION_NAME = OPENAI_INTEGRATION_NAME;
//# sourceMappingURL=constants.js.map
