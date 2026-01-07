/**
 * @fileoverview disallow literal string
 * @author edvardchen
 */
'use strict';

const _ = require('lodash');
const {
  isUpperCase,
  getNearestAncestor,
  isAllowedDOMAttr,
  shouldSkip,
} = require('../helper');

function isValidFunctionCall(context, options, { callee }) {
  if (callee.type === 'Import') return true;

  const sourceText = context.getSourceCode().getText(callee);

  return shouldSkip(options.callees, sourceText);
}

function isValidLiteral(options, { value }) {
  if (typeof value !== 'string') {
    return true;
  }
  const trimed = value.trim();
  if (!trimed) return true;

  if (shouldSkip(options.words, trimed)) return true;
}

/**
 * @param {VDirective | VAttribute} node
 * @returns {string | null}
 */
function getAttributeName(node) {
  if (!node.directive) {
    return node.key.rawName;
  }

  if (
    (node.key.name.name === 'bind' || node.key.name.name === 'model') &&
    node.key.argument &&
    node.key.argument.type === 'VIdentifier'
  ) {
    return node.key.argument.rawName;
  }

  return null;
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

module.exports = {
  meta: {
    docs: {
      description: 'disallow literal string',
      category: 'Best Practices',
      recommended: true,
    },
    schema: [require('../options/schema.json')],
  },

  create(context) {
    // variables should be defined here
    const parserServices =
      context.parserServices || context.sourceCode.parserServices;
    const options = _.defaults(
      {},
      context.options[0],
      require('../options/defaults')
    );

    const {
      mode,
      'should-validate-template': validateTemplate,
      message,
      framework,
    } = options;
    const onlyValidateJSX = ['jsx-only', 'jsx-text-only'].includes(mode);

    const onlyValidateVueTemplate =
      framework === 'vue' && mode === 'vue-template-only';

    //----------------------------------------------------------------------
    // Helpers
    //----------------------------------------------------------------------

    const indicatorStack = [];

    function endIndicator() {
      indicatorStack.pop();
    }

    /**
     * detect if current "scope" is valid
     */
    function isValidScope() {
      return indicatorStack.some(item => item);
    }

    //----------------------------------------------------------------------
    // Public
    //----------------------------------------------------------------------

    function report(node) {
      context.report({
        node,
        message: `${message}: ${context.getSourceCode().getText(node.parent)}`,
      });
    }

    const { esTreeNodeToTSNodeMap, program } = parserServices;
    let typeChecker;
    if (program && esTreeNodeToTSNodeMap)
      typeChecker = program.getTypeChecker();

    function validateBeforeReport(node) {
      if (isValidScope()) return;
      if (isValidLiteral(options, node)) return;

      // ─── Typescript ──────────────────────────────────────

      if (typeChecker) {
        const tsNode = esTreeNodeToTSNodeMap.get(node);
        const typeObj = typeChecker.getContextualType(tsNode);
        if (typeObj) {
          // var a: 'abc' = 'abc'
          if (typeObj.isStringLiteral()) {
            return;
          }

          // var a: 'abc' | 'name' = 'abc'
          if (typeObj.isUnion()) {
            const found = typeObj.types.some(item => {
              if (item.isStringLiteral() && item.value === node.value) {
                return true;
              }
            });
            if (found) return;
          }
        }
      }
      // ─────────────────────────────────────────────────────

      report(node);
    }

    function filterOutJSX(node) {
      if (onlyValidateJSX) {
        const isInsideJSX = (
          context.getAncestors || context.sourceCode.getAncestors
        )(node).some(item => ['JSXElement', 'JSXFragment'].includes(item.type));

        if (!isInsideJSX) return true;

        if (
          mode === 'jsx-text-only' &&
          !['JSXElement', 'JSXFragment'].includes(node.parent.type)
        ) {
          // Under mode jsx-text-only, if the direct parent isn't JSXElement or JSXFragment then skip
          return true;
        }
      }
      return false;
    }

    const scriptVisitor = {
      //
      // ─── EXPORT AND IMPORT ───────────────────────────────────────────
      //

      ImportExpression(node) {
        // allow (import('abc'))
        indicatorStack.push(true);
      },
      'ImportExpression:exit': endIndicator,

      ImportDeclaration(node) {
        // allow (import abc form 'abc')
        indicatorStack.push(true);
      },
      'ImportDeclaration:exit': endIndicator,

      ExportAllDeclaration(node) {
        // allow export * from 'mod'
        indicatorStack.push(true);
      },
      'ExportAllDeclaration:exit': endIndicator,

      'ExportNamedDeclaration[source]'(node) {
        // allow export { named } from 'mod'
        indicatorStack.push(true);
      },
      'ExportNamedDeclaration[source]:exit': endIndicator,
      // ─────────────────────────────────────────────────────────────────

      //
      // ─── JSX ─────────────────────────────────────────────────────────
      //

      JSXElement(node) {
        const fullComponentName = context
          .getSourceCode()
          .getText(node.openingElement.name);
        indicatorStack.push(
          shouldSkip(options['jsx-components'], fullComponentName)
        );
      },
      'JSXElement:exit': endIndicator,

      JSXAttribute(node) {
        const attrName = node.name.name;

        // allow <MyComponent className="active" />
        if (shouldSkip(options['jsx-attributes'], attrName)) {
          indicatorStack.push(true);
          return;
        }

        const jsxElement = getNearestAncestor(node, 'JSXOpeningElement');
        const tagName = jsxElement.name.name;
        if (isAllowedDOMAttr(tagName, attrName)) {
          indicatorStack.push(true);
          return;
        }
        indicatorStack.push(false);
      },
      'JSXAttribute:exit': endIndicator,

      // @typescript-eslint/parser would parse string literal as JSXText node
      JSXText(node) {
        validateBeforeReport(node);
      },
      // ─────────────────────────────────────────────────────────────────

      //
      // ─── Vue ──────────────────────────────────────────────────
      //
      VElement(node) {
        indicatorStack.push(
          shouldSkip(options['jsx-components'], node.rawName)
        );
      },
      'VElement:exit': endIndicator,
      VAttribute(node) {
        const attrName = getAttributeName(node);
        indicatorStack.push(shouldSkip(options['jsx-attributes'], attrName));
      },
      'VAttribute:exit': endIndicator,
      // ─────────────────────────────────────────────────────────────────

      //
      // ─── TYPESCRIPT ──────────────────────────────────────────────────
      //

      TSModuleDeclaration() {
        indicatorStack.push(true);
      },
      'TSModuleDeclaration:exit': endIndicator,

      TSLiteralType(node) {
        // allow var a: Type['member'];
        indicatorStack.push(true);
      },
      'TSLiteralType:exit': endIndicator,
      TSEnumMember(node) {
        // allow enum E { "a b" = 1 }
        indicatorStack.push(true);
      },
      'TSEnumMember:exit': endIndicator,
      // ─────────────────────────────────────────────────────────────────

      /**
       * @param {import('estree').PropertyDefinition} node
       */
      PropertyDefinition(node) {
        indicatorStack.push(
          !!(node.key && shouldSkip(options['class-properties'], node.key.name))
        );
      },
      'PropertyDefinition:exit': endIndicator,

      ClassProperty(node) {
        indicatorStack.push(
          !!(node.key && shouldSkip(options['class-properties'], node.key.name))
        );
      },
      'ClassProperty:exit': endIndicator,

      VariableDeclarator(node) {
        // allow statements like const A_B = "test"
        indicatorStack.push(isUpperCase(node.id.name));
      },
      'VariableDeclarator:exit': endIndicator,

      Property(node) {
        // pick up key.name if key is Identifier or key.value if key is Literal
        // dont care whether if this is computed or not
        const result = shouldSkip(
          options['object-properties'],
          node.key.name || node.key.value
        );
        indicatorStack.push(result);
      },
      'Property:exit': endIndicator,

      BinaryExpression(node) {
        const { operator } = node;
        // allow name === 'Android'
        indicatorStack.push(operator !== '+');
      },
      'BinaryExpression:exit': endIndicator,

      AssignmentPattern(node) {
        // allow function bar(input = 'foo') {}
        indicatorStack.push(true);
      },
      'AssignmentPattern:exit': endIndicator,

      NewExpression(node) {
        indicatorStack.push(isValidFunctionCall(context, options, node));
      },
      'NewExpression:exit': endIndicator,

      CallExpression(node) {
        indicatorStack.push(isValidFunctionCall(context, options, node));
      },
      'CallExpression:exit': endIndicator,

      TaggedTemplateExpression(node) {
        indicatorStack.push(
          isValidFunctionCall(context, options, { callee: node.tag })
        );
      },
      'TaggedTemplateExpression:exit': endIndicator,
      'AssignmentExpression[left.type="MemberExpression"]'(node) {
        // allow Enum['value']
        indicatorStack.push(
          shouldSkip(options['object-properties'], node.left.property.name)
        );
      },
      'AssignmentExpression[left.type="MemberExpression"]:exit'(node) {
        endIndicator();
      },
      TemplateLiteral(node) {
        if (!validateTemplate) {
          return;
        }

        if (framework === 'react' && filterOutJSX(node)) {
          return;
        }

        if (isValidScope()) return;
        const { quasis = [] } = node;
        quasis.some(({ value: { raw } }) => {
          if (isValidLiteral(options, { value: raw })) return;
          report(node);
          return true; // break
        });
      },
      Literal(node) {
        // allow Enum['value'] and literal that follows the 'case' keyword in a switch statement.
        if (['MemberExpression', 'SwitchCase'].includes(node?.parent?.type)) {
          return;
        }

        if (framework === 'react' && filterOutJSX(node)) {
          return;
        }

        if (onlyValidateVueTemplate) {
          const parents = (
            context.getAncestors || context.sourceCode.getAncestors
          )(node);
          if (
            parents.length &&
            parents.every(
              item =>
                ![
                  'VElement',
                  'VAttribute',
                  'VText',
                  'VExpressionContainer',
                ].includes(item.type)
            )
          ) {
            return true;
          }
        }

        // ignore `var a = { "foo": 123 }`
        if (node.parent.key === node) {
          return;
        }

        validateBeforeReport(node);
      },
    };

    return (
      (parserServices.defineTemplateBodyVisitor &&
        parserServices.defineTemplateBodyVisitor(
          {
            VText(node) {
              scriptVisitor['JSXText'](node);
            },
            VLiteral(node) {
              scriptVisitor['JSXText'](node);
            },
            VElement(node) {
              scriptVisitor['VElement'](node);
            },
            'VElement:exit'(node) {
              scriptVisitor['VElement:exit'](node);
            },
            VAttribute(node) {
              scriptVisitor['VAttribute'](node);
            },
            'VAttribute:exit'(node) {
              scriptVisitor['VAttribute:exit'](node);
            },
            'VExpressionContainer CallExpression'(node) {
              scriptVisitor['CallExpression'](node);
            },
            'VExpressionContainer CallExpression:exit'(node) {
              scriptVisitor['CallExpression:exit'](node);
            },
            'VExpressionContainer Literal'(node) {
              scriptVisitor['Literal'](node);
            },
          },
          scriptVisitor
        )) ||
      scriptVisitor
    );
  },
};
