// Copyright (c) 2020, jupytercalpoly
// Distributed under the terms of the BSD-3 Clause License.

import { showDialog, Dialog } from '@jupyterlab/apputils';
import { addIcon, checkIcon } from '@jupyterlab/ui-components';
import { Contents } from '@jupyterlab/services';

import { Widget } from '@lumino/widgets';
import { JSONObject } from '@lumino/coreutils';

import { ICodeSnippet, CodeSnippetService } from './CodeSnippetService';

import { CodeSnippetWidget } from './CodeSnippetWidget';
import { SUPPORTED_LANGUAGES } from './CodeSnippetLanguages';
import { showMessage } from './ConfirmMessage';
import { showCodeSnippetForm, CodeSnippetForm } from './CodeSnippetForm';

import checkSVGstr from '../style/icon/jupyter_checkmark.svg';

/**
 * The class name added to file dialogs.
 */
const FILE_DIALOG_CLASS = 'jp-codeSnippet-fileDialog';

/**
 * CSS STYLING
 */
const CODE_SNIPPET_DIALOG_INPUT = 'jp-codeSnippet-dialog-input';
const CODE_SNIPPET_INPUTTAG_PLUS_ICON = 'jp-codeSnippet-inputTag-plusIcon';
const CODE_SNIPPET_INPUTTAG_LIST = 'jp-codeSnippet-inputTagList';
const CODE_SNIPPET_INPUT_TAG = 'jp-codeSnippet-inputTag';
const CODE_SNIPPET_INPUT_TAG_CHECK = 'jp-codeSnippet-inputTag-check';
const CODE_SNIPPET_CONFIRM_TEXT = 'jp-codeSnippet-confirm-text';

/**
 * A stripped-down interface for a file container.
 */
export interface IFileContainer extends JSONObject {
  /**
   * The list of item names in the current working directory.
   */
  items: string[];
  /**
   * The current working directory of the file container.
   */
  path: string;
}

/**
 * Save an input with a dialog. This is what actually displays everything.
 * Result.value is the value retrieved from .getValue(). ---> .getValue() returns an array of inputs.
 */
export function CodeSnippetInputDialog(
  codeSnippetWidget: CodeSnippetWidget,
  code: string[],
  idx: number
): Promise<Contents.IModel | null> {
  const tags: string[] = [];
  const codeSnippetManager = CodeSnippetService.getCodeSnippetService();

  const snippets = codeSnippetManager.snippets;

  for (const snippet of snippets) {
    if (snippet.tags) {
      for (const tag of snippet.tags) {
        if (!tags.includes(tag)) {
          tags.push(tag);
        }
      }
    }
  }

  const body: InputHandler = new InputHandler(tags);

  return showInputDialog(
    codeSnippetWidget,
    tags,
    idx,
    codeSnippetManager,
    code,
    body
  );
}

/**
 * This function creates the actual input form and processes the inputs given.
 */
export function showInputDialog(
  codeSnippetWidget: CodeSnippetWidget,
  tags: string[],
  idx: number,
  codeSnippetManager: CodeSnippetService,
  code: string[],
  body: InputHandler
): Promise<Contents.IModel | null> {
  return showCodeSnippetForm({
    title: 'Save Code Snippet',
    body: body,
    buttons: [
      CodeSnippetForm.cancelButton(),
      CodeSnippetForm.okButton({ label: 'Save' }),
    ],
  }).then((result: CodeSnippetForm.IResult<string[]>) => {
    if (!result.value) {
      return null;
    }

    if (validateForm(result) === false) {
      showInputDialog(
        codeSnippetWidget,
        tags,
        idx,
        codeSnippetManager,
        code,
        body
      );
    } else {
      const tags = result.value.slice(3);
      const newSnippet: ICodeSnippet = {
        name: result.value[0].replace(' ', ''),
        description: result.value[1],
        language: result.value[2],
        code: code,
        id: idx,
        tags: tags,
      };

      for (const snippet of codeSnippetManager.snippets) {
        if (snippet.name === newSnippet.name) {
          saveOverWriteFile(codeSnippetManager, snippet, newSnippet).then(
            (res: boolean) => {
              if (res) {
                codeSnippetWidget.renderCodeSnippetsSignal.emit(
                  codeSnippetManager.snippets
                );
              }
            }
          );
          return;
        }
      }

      createNewSnippet(codeSnippetWidget, newSnippet, codeSnippetManager);
    }
  });
}

function createNewSnippet(
  codeSnippetWidget: CodeSnippetWidget,
  newSnippet: ICodeSnippet,
  codeSnippetManager: CodeSnippetService
): void {
  codeSnippetManager.addSnippet(newSnippet).then((res: boolean) => {
    if (!res) {
      console.log('Error in adding snippet');
      return;
    }
  });

  codeSnippetWidget.renderCodeSnippetsSignal.emit(codeSnippetManager.snippets);
  showMessage({
    body: new MessageHandler(),
  });
}

/**
 * Rename a file, warning for overwriting another.
 */
export async function saveOverWriteFile(
  codeSnippetManager: CodeSnippetService,
  oldSnippet: ICodeSnippet,
  newSnippet: ICodeSnippet
): Promise<boolean> {
  const newName = newSnippet.name;

  return await shouldOverwrite(newName).then((res) => {
    if (res) {
      newSnippet.id = oldSnippet.id;

      codeSnippetManager.deleteSnippet(oldSnippet.id).then((res: boolean) => {
        if (!res) {
          console.log('Error in overwriting a snippet (delete)');
          return false;
        }
      });
      codeSnippetManager.addSnippet(newSnippet).then((res: boolean) => {
        if (!res) {
          console.log('Error in overwriting a snippet (add)');
          return false;
        }
      });
      return true;
    }
  });
}

/**
 * Ask the user whether to overwrite a file.
 */
async function shouldOverwrite(newName: string): Promise<boolean> {
  const options = {
    title: 'Overwrite code snippet?',
    body: `"${newName}" already exists, overwrite?`,
    buttons: [Dialog.cancelButton(), Dialog.warnButton({ label: 'Overwrite' })],
  };
  return showDialog(options).then((result) => {
    return result.button.accept;
  });
}

/**
 * Test whether a name is a valid file name
 *
 * Disallows "/", "\", and ":" in file names, as well as names with zero length.
 */
export function isValidFileName(name: string): boolean {
  const validNameExp = /[/\\:]/;
  return name.length > 0 && !validNameExp.test(name);
}

/**
 * Test whether user typed in all required inputs.
 */
export function validateForm(
  input: CodeSnippetForm.IResult<string[]>
): boolean {
  let status = true;
  let message = '';
  const name = input.value[0];
  const language = input.value[2];

  if (name === '') {
    message += 'Name must be filled out\n';
    status = false;
  }
  if (language === '') {
    message += 'Language must be filled out\n';
    status = false;
  }
  if (!SUPPORTED_LANGUAGES.includes(language)) {
    message += 'Language must be one of the options';
    status = false;
  }
  // TODO: change it to a better UI
  if (status === false) {
    alert(message);
  }
  return status;
}
/**
 * A widget used to get input data.
 */
class InputHandler extends Widget {
  /**
   * Construct a new "code snippet" dialog.
   * readonly inputNode: HTMLInputElement; <--- in Widget class
   */
  constructor(tags: string[]) {
    super({ node: Private.createInputNode(tags) });
    this.addClass(FILE_DIALOG_CLASS);
  }

  getValue(): string[] {
    const inputs = [];
    inputs.push(
      (this.node.getElementsByTagName('input')[0] as HTMLInputElement).value,
      (this.node.getElementsByTagName('input')[1] as HTMLInputElement).value,
      (this.node.getElementsByTagName('input')[2] as HTMLInputElement).value
    );

    inputs.push(...Private.selectedTags);

    // reset selectedTags
    Private.selectedTags = [];

    return inputs;
  }
}

class MessageHandler extends Widget {
  constructor() {
    super({ node: Private.createConfirmMessageNode() });
  }
}

/**
 * A namespace for private data.
 */
class Private {
  static selectedTags: string[] = [];
  static allTags: string[];

  static handleOnBlur(event: Event): void {
    const target = event.target as HTMLElement;
    if (!target.classList.contains('touched')) {
      target.classList.add('touched');
    }
  }

  /**
   * Create the node for a code snippet form handler. This is what's creating all of the elements to be displayed.
   */
  static createInputNode(tags: string[]): HTMLElement {
    Private.allTags = tags;
    const body = document.createElement('form');

    const nameTitle = document.createElement('label');
    nameTitle.textContent = 'Snippet Name (required)';
    const name = document.createElement('input');
    name.className = CODE_SNIPPET_DIALOG_INPUT;
    name.required = true;
    name.placeholder = 'Ex. starter code';
    name.onblur = Private.handleOnBlur;

    const descriptionTitle = document.createElement('label');
    descriptionTitle.textContent = 'Description (optional)';
    const description = document.createElement('input');
    description.className = CODE_SNIPPET_DIALOG_INPUT;
    description.placeholder = 'Description';
    description.onblur = Private.handleOnBlur;

    const languageTitle = document.createElement('label');
    languageTitle.textContent = 'Language (required)';
    const languageInput = document.createElement('input');
    languageInput.className = CODE_SNIPPET_DIALOG_INPUT;
    languageInput.setAttribute('list', 'languages');
    languageInput.required = true;
    const languageOption = document.createElement('datalist');
    languageOption.id = 'languages';
    languageOption.onblur = Private.handleOnBlur;

    SUPPORTED_LANGUAGES.sort();
    for (const language of SUPPORTED_LANGUAGES) {
      const option = document.createElement('option');
      option.value = language;
      languageOption.appendChild(option);
    }

    const tagList = document.createElement('li');
    tagList.classList.add(CODE_SNIPPET_INPUTTAG_LIST);
    for (const tag of tags) {
      const tagElem = document.createElement('ul');
      tagElem.className = `${CODE_SNIPPET_INPUT_TAG} tag unapplied-tag`;
      const tagBtn = document.createElement('button');
      tagBtn.innerText = tag;
      tagBtn.onclick = Private.handleClick;
      tagElem.appendChild(tagBtn);
      tagList.appendChild(tagElem);
    }

    const addTagElem = document.createElement('ul');
    addTagElem.className = `${CODE_SNIPPET_INPUT_TAG} tag unapplied-tag`;
    const newTagName = document.createElement('button');
    newTagName.innerText = 'Add Tag';
    newTagName.style.cursor = 'pointer';
    addTagElem.appendChild(newTagName);
    const plusIcon = addIcon.element({
      tag: 'span',
      className: CODE_SNIPPET_INPUTTAG_PLUS_ICON,
      elementPosition: 'center',
      height: '16px',
      width: '16px',
      marginLeft: '2px',
    });

    newTagName.onclick = Private.addTag;

    addTagElem.appendChild(plusIcon);
    tagList.append(addTagElem);

    body.appendChild(nameTitle);
    body.appendChild(name);
    body.appendChild(descriptionTitle);
    body.appendChild(description);
    body.appendChild(languageTitle);
    body.appendChild(languageInput);
    body.appendChild(languageOption);
    body.appendChild(tagList);
    return body;
  }

  // replace the newTagName to input and delete plusIcon and insertbefore current tag on keydown or blur (refer to cell tags)
  static addTag(event: MouseEvent): boolean {
    event.preventDefault();
    const target = event.target as HTMLElement;

    const plusIcon = document.querySelector(
      '.jp-codeSnippet-inputTag-plusIcon'
    );
    plusIcon.remove();

    const newTagName = document.createElement('input');
    target.parentElement.replaceChild(newTagName, target);

    newTagName.onkeydown = Private.addTagOnKeyDown;
    newTagName.onblur = Private.addTagOnBlur;
    newTagName.focus();
    return false;
  }

  static addTagOnKeyDown(event: KeyboardEvent): void {
    const inputElement = event.target as HTMLInputElement;

    if (inputElement.value !== '' && event.keyCode === 13) {
      // duplicate tag
      if (Private.allTags.includes(inputElement.value)) {
        alert('Duplicate Tag Name!');
        return;
      }
      event.preventDefault();

      // create new tag
      const tagList = document.querySelector('.jp-codeSnippet-inputTagList');
      const tagElem = document.createElement('ul');
      tagElem.className = `${CODE_SNIPPET_INPUT_TAG} tag applied-tag`;
      const tagBtn = document.createElement('button');
      tagBtn.innerText = inputElement.value;
      tagBtn.onclick = Private.handleClick;
      tagElem.appendChild(tagBtn);
      tagList.insertBefore(tagElem, inputElement.parentElement);

      // add check mark when tag gets selected
      const iconContainer = checkIcon.element({
        className: CODE_SNIPPET_INPUT_TAG_CHECK,
        tag: 'span',
        elementPosition: 'center',
        height: '18px',
        width: '18px',
        marginLeft: '5px',
        marginRight: '-3px',
      });
      const color = getComputedStyle(document.documentElement).getPropertyValue(
        '--jp-ui-font-color1'
      );
      tagBtn.style.color = color;
      tagElem.appendChild(iconContainer);

      // add it to the selected tags
      Private.selectedTags.push(tagBtn.innerText);
      Private.allTags.push(tagBtn.innerText);

      // reset InputElement
      inputElement.blur();
      event.stopPropagation();
    }
  }

  static addTagOnBlur(event: FocusEvent): void {
    const inputElement = event.target as HTMLInputElement;

    // add plusIcon
    const plusIcon = addIcon.element({
      tag: 'span',
      className: CODE_SNIPPET_INPUTTAG_PLUS_ICON,
      elementPosition: 'center',
      height: '16px',
      width: '16px',
      marginLeft: '2px',
    });

    // change input to span
    const newTagName = document.createElement('button');
    newTagName.innerText = 'Add Tag';
    newTagName.style.cursor = 'pointer';
    inputElement.parentElement.replaceChild(newTagName, inputElement);

    newTagName.parentElement.appendChild(plusIcon);
    newTagName.onclick = Private.addTag;
  }

  static handleClick(event: MouseEvent): boolean {
    const target = event.target as HTMLElement;
    const parent = target.parentElement;

    if (parent.classList.contains('unapplied-tag')) {
      Private.selectedTags.push(target.innerText);
      parent.classList.replace('unapplied-tag', 'applied-tag');
      const iconContainer = checkIcon.element({
        className: CODE_SNIPPET_INPUT_TAG_CHECK,
        tag: 'span',
        elementPosition: 'center',
        height: '18px',
        width: '18px',
        marginLeft: '5px',
        marginRight: '-3px',
      });
      const color = getComputedStyle(document.documentElement).getPropertyValue(
        '--jp-ui-font-color1'
      );
      target.style.color = color;
      if (parent.children.length === 1) {
        parent.appendChild(iconContainer);
      }
    } else if (parent.classList.contains('applied-tag')) {
      const idx = Private.selectedTags.indexOf(target.innerText);
      Private.selectedTags.splice(idx, 1);

      parent.classList.replace('applied-tag', 'unapplied-tag');
      const color = getComputedStyle(document.documentElement).getPropertyValue(
        '--jp-ui-font-color2'
      );
      target.style.color = color;

      if (parent.children.length !== 1) {
        // remove check icon
        parent.removeChild(parent.children.item(1));
      }
    }
    return false;
  }

  // create a confirm message when new snippet is created successfully
  static createConfirmMessageNode(): HTMLElement {
    const body = document.createElement('div');
    body.innerHTML = checkSVGstr;

    const messageContainer = document.createElement('div');
    messageContainer.className = CODE_SNIPPET_CONFIRM_TEXT;
    const message = document.createElement('text');
    message.textContent = 'Saved as Snippet!';
    messageContainer.appendChild(message);
    body.append(messageContainer);
    return body;
  }
}
