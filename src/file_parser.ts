// Example
// {
//   name: "some_method",
//   type: "def",
//   start_line: 2,
//   end_line: 5
// }

export default class FileParser {
  fileText: any;
  lines: any;
  first_line: any;
  constructor(fileText: any) {
    this.fileText = fileText
    this.lines = this.fileText.split("\n")
  }
  symbol_informations() {
    var blocks: any = [];
    this.lines.forEach((line: any, index: any) => {
      let lineParse = new LineParse(line);
      if (lineParse.isBlock()) {
        let blockType = lineParse.getBlockType();
        var block = {
          name: lineParse.getBlockName(blockType),
          start_line: index,
          type: blockType,
          end_line: index
        }
        blocks = [...blocks, block]
      }
    });
    return this.getPermitedBlocks(blocks)
  }

  getPermitedBlocks(blocks: any) {
    return blocks.filter((block: any) => (
      (block.end_line || block.end_line === 0) &&
      _.includes(["def", "class", "closure"], block.type) &&
      !!block.name
    ))
  }

  dependences() {
    var blocks: any = [];
    this.lines.forEach((line: any, index: any) => {
      let lineParse = new LineParse(line);
      if (lineParse.isDependenceInjection()) {
        if (!this.first_line && this.first_line !== 0) this.first_line = index;
        var block = {
          line: line,
          start_line: index,
        }
        blocks = [...blocks, block]
      }
    });
    return blocks;
  }
}

/** TagLib / field closures: `def myTag = { attrs, body ->` */
const closureRegEx = /^\s*(?:(?:public|private|protected)\s+)?def\s+([A-Za-z_]\w*)\s*=\s*\{/;
const functionRegEx = /(def|public|private|protected|boolean|double|string|int|long|integer|void)+\s+.*\s*[a-z]*\(.*\)*\{/i;
const dependeceRegEx = /def+\s+.*Service/i;

class LineParse {
  line: any;
  constructor(line: any) { this.line = line }
  isAClassBlock() { return /class /.test(this.line) }
  isAClosureBlock() { return closureRegEx.test(this.line) }
  isAFunctionBlock() {
    if (this.isAClosureBlock()) { return false }
    return this.line.match(functionRegEx);
  }
  isDependenceInjection() {
    return this.line.match(dependeceRegEx);
  }
  isBlock() {
    return (
      this.isAClassBlock() ||
      this.isAClosureBlock() ||
      this.isAFunctionBlock()
    )
  }
  getBlockType() {
    if (this.isAClassBlock()) { return "class" }
    if (this.isAClosureBlock()) { return "closure" }
    if (this.isAFunctionBlock()) { return "def" }
    return undefined
  }

  getBlockName(blockType: any) {
    if (blockType == "class") {
      return this.line.replace(/.*\bclass\b/, "").replace("{", "").trim()
    }
    if (blockType == "closure") {
      const match = this.line.match(closureRegEx);
      return match ? match[1] : undefined;
    }
    if (blockType == "def") {
      let name = this.line.split('(')[0].replace(/(def|public|private|protected)/i, "").trim();
      return name;
    }
    return undefined
  }
}

const _ = {
  includes: (array: any, value: any) => (array.indexOf(value) != -1)
}
