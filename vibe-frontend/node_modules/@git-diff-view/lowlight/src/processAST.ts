import type { DiffAST } from ".";

export type SyntaxNode = {
  type: string;
  value: string;
  lineNumber: number;
  startIndex: number;
  endIndex: number;
  properties?: { className?: string[]; [key: string]: any };
  children?: SyntaxNode[];
};

export type SyntaxLine = {
  value: string;
  lineNumber: number;
  valueLength: number;
  nodeList: { node: SyntaxNode; wrapper?: SyntaxNode }[];
};

export const processAST = (ast: DiffAST) => {
  let lineNumber = 1;

  const syntaxObj: Record<number, SyntaxLine> = {};

  const loopAST = (nodes: SyntaxNode[], wrapper?: SyntaxNode) => {
    nodes.forEach((node) => {
      if (node.type === "text") {
        if (node.value.indexOf("\n") === -1) {
          const valueLength = node.value.length;
          if (!syntaxObj[lineNumber]) {
            node.startIndex = 0;
            node.endIndex = valueLength - 1;
            const item = {
              value: node.value,
              lineNumber,
              valueLength,
              nodeList: [{ node, wrapper }],
            };
            syntaxObj[lineNumber] = item;
          } else {
            node.startIndex = syntaxObj[lineNumber].valueLength;
            node.endIndex = node.startIndex + valueLength - 1;
            syntaxObj[lineNumber].value += node.value;
            syntaxObj[lineNumber].valueLength += valueLength;
            syntaxObj[lineNumber].nodeList.push({ node, wrapper });
          }
          node.lineNumber = lineNumber;
          return;
        }

        const lines = node.value.split("\n");
        node.children = node.children || [];
        for (let i = 0; i < lines.length; i++) {
          const _value = i === lines.length - 1 ? lines[i] : lines[i] + "\n";
          const _lineNumber = i === 0 ? lineNumber : ++lineNumber;
          const _valueLength = _value.length;
          const _node: SyntaxNode = {
            type: "text",
            value: _value,
            startIndex: Infinity,
            endIndex: Infinity,
            lineNumber: _lineNumber,
          };
          if (!syntaxObj[_lineNumber]) {
            _node.startIndex = 0;
            _node.endIndex = _valueLength - 1;
            const item = {
              value: _value,
              lineNumber: _lineNumber,
              valueLength: _valueLength,
              nodeList: [{ node: _node, wrapper }],
            };
            syntaxObj[_lineNumber] = item;
          } else {
            _node.startIndex = syntaxObj[_lineNumber].valueLength;
            _node.endIndex = _node.startIndex + _valueLength - 1;
            syntaxObj[_lineNumber].value += _value;
            syntaxObj[_lineNumber].valueLength += _valueLength;
            syntaxObj[_lineNumber].nodeList.push({ node: _node, wrapper });
          }
          node.children.push(_node);
        }

        node.lineNumber = lineNumber;

        return;
      }
      if (node.children) {
        loopAST(node.children, node);

        node.lineNumber = lineNumber;
      }
    });
  };

  loopAST(ast.children as SyntaxNode[]);

  return { syntaxFileObject: syntaxObj, syntaxFileLineNumber: lineNumber };
};
