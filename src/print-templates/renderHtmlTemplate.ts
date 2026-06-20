type TemplateContext = Record<string, unknown>;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isTruthy(value: unknown): boolean {
  if (value === false || value === null || value === undefined) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  return true;
}

function renderBlock(
  template: string,
  context: TemplateContext,
  process: (input: string, ctx: TemplateContext) => string
): string {
  return process(template, context);
}

function renderEachBlocks(template: string, context: TemplateContext, process: (input: string, ctx: TemplateContext) => string): string {
  return template.replace(/\{\{#each (\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (_, key: string, block: string) => {
    const list = context[key];
    if (!Array.isArray(list) || list.length === 0) return '';
    return list
      .map((item, index) => {
        const rowContext: TemplateContext = {
          ...context,
          ...(typeof item === 'object' && item !== null ? (item as TemplateContext) : { value: item }),
          index: index + 1,
        };
        return process(block, rowContext);
      })
      .join('');
  });
}

function renderIfBlocks(template: string, context: TemplateContext, process: (input: string, ctx: TemplateContext) => string): string {
  let output = template.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key: string, block: string) => {
    return isTruthy(context[key]) ? process(block, context) : '';
  });
  output = output.replace(/\{\{#unless (\w+)\}\}([\s\S]*?)\{\{\/unless\}\}/g, (_, key: string, block: string) => {
    return isTruthy(context[key]) ? '' : process(block, context);
  });
  return output;
}

function renderVariables(template: string, context: TemplateContext): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = context[key];
    if (value === null || value === undefined) return '';
    return escapeHtml(String(value));
  });
}

/** Render a lightweight mustache-style HTML template. */
export function renderHtmlTemplate(template: string, context: TemplateContext): string {
  const process = (input: string, ctx: TemplateContext): string => {
    let output = input;
    for (let pass = 0; pass < 8; pass += 1) {
      const before = output;
      output = renderEachBlocks(output, ctx, process);
      output = renderIfBlocks(output, ctx, process);
      if (output === before) break;
    }
    return renderVariables(output, ctx);
  };

  return renderBlock(template, context, process);
}
