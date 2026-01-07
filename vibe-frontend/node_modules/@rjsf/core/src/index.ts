import Form, { FormProps, FormState, IChangeEvent } from './components/Form';
import RichDescription, { RichDescriptionProps } from './components/RichDescription';
import RichHelp, { RichHelpProps } from './components/RichHelp';
import withTheme, { ThemeProps } from './withTheme';
import getDefaultRegistry from './getDefaultRegistry';
import getTestRegistry from './getTestRegistry';

export type { FormProps, FormState, IChangeEvent, ThemeProps, RichDescriptionProps, RichHelpProps };

export { withTheme, getDefaultRegistry, getTestRegistry, RichDescription, RichHelp };
export default Form;
