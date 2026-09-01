export const inputBase = 'form-input';
export const btnPrimary = 'button-primary';
export const btnGhost = 'button-secondary';
export const btnPrimarySm = 'button-primary-sm';
export const fieldLabel = 'field-label';
export const surface = 'surface';
export const surfaceHeader = 'surface-header';
export const surfaceBody = 'surface-body';
export const surfaceFooter = 'surface-footer';
export const surfaceFormFooter = 'surface-form-footer';
export const surfaceContent = 'surface-content';
export const errorMessage = 'message-error';

export function tabClass(active: boolean): string {
  return `tab-button ${active ? 'tab-button-active' : 'tab-button-idle'}`;
}
