import { generateTemplates } from '../Templates/index.js';
import { generateWidgets } from '../Widgets/index.js';
export function generateTheme() {
    return {
        templates: generateTemplates(),
        widgets: generateWidgets(),
    };
}
export default generateTheme();
//# sourceMappingURL=Theme.js.map