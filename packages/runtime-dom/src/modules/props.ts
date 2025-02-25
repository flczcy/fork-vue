import { DeprecationTypes, compatUtils, warn } from '@vue/runtime-core'
import { includeBooleanAttr } from '@vue/shared'
import { unsafeToTrustedHTML } from '../nodeOps'

// functions. The user is responsible for using them with only trusted content.
export function patchDOMProp(
  el: any,
  key: string,
  value: any,
  parentComponent: any,
  attrName?: string,
): void {
  // __UNSAFE__
  // Reason: potentially setting innerHTML.
  // This can come from explicit usage of v-html or innerHTML as a prop in render
  if (key === 'innerHTML' || key === 'textContent') {
    // null value case is handled in renderer patchElement before patching
    // children 指的是这里的处理
    // #9135 innerHTML / textContent unset needs to happen before possible new children mount
    // if (
    //   (oldProps.innerHTML && newProps.innerHTML == null) ||
    //   (oldProps.textContent && newProps.textContent == null)
    // ) {
    //   hostSetElementText(el, '')
    // }
    if (value != null) {
      el[key] = key === 'innerHTML' ? unsafeToTrustedHTML(value) : value
    }
    return
  }

  const tag = el.tagName

  // 这里是针对 value 属性的处理
  if (
    key === 'value' &&
    tag !== 'PROGRESS' &&
    // web components 自定义元素必须是使用 `-` 分割
    // 自定义元素的名称必须包含至少一个短横线 (-)。这是为了区分自定义元素和内置的HTML元素
    // customElements.define('mycustomcomponent', MyCustomComponent);
    // Uncaught SyntaxError: Failed to execute 'define' on 'CustomElementRegistry': "mycustomcomponent" is not a valid custom element name

    // custom elements may use _value internally
    !tag.includes('-')
  ) {
    // #4956: <option> value will fallback to its text content so we need to
    // compare against its attribute value instead.
    const oldValue =
      tag === 'OPTION' ? el.getAttribute('value') || '' : el.value
    const newValue =
      value == null
        ? // #11647: value should be set as empty string for null and undefined,
          // but <input type="checkbox"> should be set as 'on'.
          el.type === 'checkbox'
          ? 'on'
          : ''
        : String(value)
    if (oldValue !== newValue || !('_value' in el)) {
      el.value = newValue
    }
    if (value == null) {
      el.removeAttribute(key)
    }
    // store value as _value as well since
    // non-string values will be stringified.
    el._value = value
    return
  }

  let needRemove = false
  if (value === '' || value == null) {
    const type = typeof el[key]
    if (type === 'boolean') {
      // e.g. <select multiple> compiles to { multiple: '' }
      value = includeBooleanAttr(value)
    } else if (value == null && type === 'string') {
      // e.g. <div :id="null">
      value = ''
      needRemove = true
    } else if (type === 'number') {
      // e.g. <img :width="null">
      value = 0
      needRemove = true
    }
  } else {
    if (
      __COMPAT__ &&
      value === false &&
      compatUtils.isCompatEnabled(
        DeprecationTypes.ATTR_FALSE_VALUE,
        parentComponent,
      )
    ) {
      const type = typeof el[key]
      if (type === 'string' || type === 'number') {
        __DEV__ &&
          compatUtils.warnDeprecation(
            DeprecationTypes.ATTR_FALSE_VALUE,
            parentComponent,
            key,
          )
        value = type === 'number' ? 0 : ''
        needRemove = true
      }
    }
  }

  // some properties perform value validation and throw,
  // some properties has getter, no setter, will error in 'use strict'
  // eg. <select :type="null"></select> <select :willValidate="null"></select>
  try {
    el[key] = value
  } catch (e: any) {
    // do not warn if value is auto-coerced(自动类型转换) from nullish values
    if (__DEV__ && !needRemove) {
      warn(
        `Failed setting prop "${key}" on <${tag.toLowerCase()}>: ` +
          `value ${value} is invalid.`,
        e,
      )
    }
  }
  needRemove && el.removeAttribute(attrName || key)
}
