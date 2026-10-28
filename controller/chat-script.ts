/** Browser UI chat submission. Reuse an already-open tab and respond as soon as
 * streaming has actually stopped; no unsafe private message-submit calls. */
export function buildChatScript(
  prompt: string,
  newChat: boolean,
  conversationPath?: string,
): string {
  const wanted = JSON.stringify(conversationPath || null);
  const text = JSON.stringify(prompt);
  return [
    "async (page) => {",
    "  const targetPath = " + wanted + ";",
    "  const targetUrl = targetPath ? 'https://chatgpt.com' + targetPath : 'https://chatgpt.com/';",
    "  const existing = page.context().pages().find(t => !t.isClosed() && t.url().split('?')[0].split('#')[0] === targetUrl);",
    "  const tab = existing || page;",
    "  if (tab.url().split('?')[0].split('#')[0] !== targetUrl && (targetPath || " +
      newChat +
      ")) await tab.goto(targetUrl);",
    "  if (await tab.getByRole('button',{name:'Open profile menu'}).count() === 0) return {error:'LOGIN_REQUIRED'};",
    "  const composer = tab.getByRole('textbox',{name:/Ask ChatGPT|Chat with ChatGPT/});",
    "  await composer.waitFor({state:'visible',timeout:15000});",
    "  if (targetPath) {",
    "    const region=tab.getByRole('region',{name:'Conversation'});",
    "    if ((await region.innerText()).includes('Could not load this ChatGPT conversation') ||",
    "      await region.getByText('You said:',{exact:true}).count()===0) return {error:'UNAVAILABLE'};",
    "  }",
    "  const headings = tab.getByText('ChatGPT said:',{exact:true});",
    "  const before = await headings.count();",
    "  await composer.fill(" + text + ");",
    "  await composer.press('Enter');",
    "  const startedAt = Date.now();",
    "  const stop = tab.getByRole('button',{name:'Stop',exact:true});",
    "  let sawStop=false,found=false,firstReplyAt=0,previous='',stable=0;",
    "  while (Date.now()-startedAt < 110000) {",
    "    const streaming = await stop.count() > 0;",
    "    if (streaming) sawStop = true;",
    "    if (await headings.count() > before) { found=true; if(!firstReplyAt) firstReplyAt=Date.now(); }",
    "    if (found) {",
    "      // Select the heading's enclosing message, not the heading alone.",
    "      const message = (await headings.last().locator('xpath=../..').innerText())",
    "        .replace(/^ChatGPT said:\\s*/, '').trim();",
    "      if(message && message === previous) stable++; else stable=0;",
    "      previous=message;",
    "      // Never return while the Stop control shows generation is active.",
    "      // If the control was never seen, require a longer fallback idle window.",
    "      if(message && !streaming && ((sawStop && stable>=2) ||",
    "        (!sawStop && stable>=5 && Date.now()-firstReplyAt>=2600))) {",
    "        const url=tab.url().split('?')[0].split('#')[0];",
    "        const path=url.startsWith('https://chatgpt.com/c/')",
    "          ? url.slice('https://chatgpt.com'.length) : null;",
    "        return {reply:message,conversationPath:path};",
    "      }",
    "    }",
    "    await tab.waitForTimeout(200);",
    "  }",
    "  return {error:found?'RESPONSE_TIMEOUT':'NO_RESPONSE'};",
    "}",
  ].join("\n");
}
