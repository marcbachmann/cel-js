export default [
  {
    name: 'Simple Number',
    expression: '42'
  },
  {
    name: 'Simple String',
    expression: '"hello world"'
  },
  {
    name: 'Simple Boolean',
    expression: 'true'
  },
  {
    name: 'String concat',
    expression:
      '"hello world" + "hello world" + "hello world" + "hello world" + "hello world" + "hello world"'
  },
  {
    name: 'hex concat',
    expression: '0x01 + 0x02 + 0x03 + 0x04 + 0x05 + 0x06 + 0x07 + 0x08'
  },
  {
    name: 'double concat',
    expression: '1.0 + 1.0 + 1.0 + 1.0 + 1.0 + 1.0 + 1.0 + 1.0'
  },
  {
    name: 'long int',
    expression: '12345678901234567 + 12345678901234567 + 12345678901234567 + 12345678901234567'
  },
  {
    name: 'long identifier',
    expression: 'somelongidentifier + somelongidentifier + somelongidentifier + somelongidentifier',
    context: {somelongidentifier: '12345678901234567'}
  }
]
