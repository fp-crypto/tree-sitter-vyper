const PREC = {
  // this resolves a conflict between the usage of ':' in a lambda vs in a
  // typed parameter. In the case of a lambda, we don't allow typed parameters.
  lambda: -2,
  typed_parameter: -1,
  conditional: -1,

  parenthesized_expression: 1,
  parenthesized_list_splat: 1,
  or: 10,
  and: 11,
  not: 12,
  compare: 13,
  bitwise_or: 14,
  bitwise_and: 15,
  xor: 16,
  shift: 17,
  plus: 18,
  times: 19,
  unary: 20,
  power: 21,
  call: 22,
};

module.exports = grammar({
  name: "vyper",

  rules: {
    // TODO: add the actual grammar rules
    module: ($) =>
      repeat(
        choice(
          //$.docstring,
          $.comment,
          $.import_statement,
          //$.struct_def,
          //$.interface_def,
          $.constant_def
          //$.variable_def,
          //$.enum_def,
          //$.event_def,
          //$.function_def,
          //$.immutable_def,
          //$._NEWLINE
        )
      ),

    _import_from: ($) =>
      seq("from", choice(seq(repeat("."), $._import_path), repeat1("."))),
    _import_list: ($) =>
      seq(
        $._import_name,
        optional($.import_alias),
        repeat(seq(",", $._import_name, optional($.import_alias))),
        optional(",")
      ),
    _import_path: ($) => seq(repeat(seq($._import_name, ".")), $._import_name),
    _import_name: ($) => field("name", $.identifier),
    import_alias: ($) => field("alias", $.identifier),
    import_basic: ($) =>
      seq("import", repeat("."), $._import_path, optional($.import_alias)),
    import_from_single: ($) =>
      seq(
        $._import_from,
        "import",
        choice("*", seq($._import_name, optional($.import_alias)))
      ),
    import_from_list: ($) =>
      seq($._import_from, "import", "(", $._import_list, ")"),

    import_statement: ($) =>
      choice($.import_basic, $.import_from_single, $.import_from_list),

    constant_def: ($) =>
      seq(
        field("name", $.name),
        ":",
        "constant",
        "(",
        $.type,
        ")",
        "=",
        $._expr
      ),

    name: ($) => /[a-zA-Z_]\w*/,

    // Expressions
    _expr: ($) => choice($.operation, $.dict),

    get_item: ($) => seq($.variable_access, "[", $._expr, "]"),
    get_attr: ($) => seq($.variable_access, ".", $.name),
    call: ($) => seq($.variable_access, "(", optional($.arguments), ")"),
    variable_access: ($) =>
      choice($.name, $.get_item, $.call, seq("(", $.variable_access, ")")),

    arg: ($) => $._expr,
    kwarg: ($) => seq($.name, "=", $._expr),
    argument: ($) => choice($.arg, $.kwarg),
    arguments: ($) =>
      seq($.argument, repeat(seq(",", $.argument)), optional(",")),

    //tuple: "(" "," ")" | "(" _expr ( ("," _expr)+ [","] | "," ) ")"
    //list: "[" "]" | "[" _expr ("," _expr)* [","] "]"
    dict: ($) =>
      choice(
        seq("{", "}"),
        seq(
          "{",
          $.name,
          ":",
          $._expr,
          repeat(seq(",", $.name, ":", $._expr)),
          optional(","),
          "}"
        )
      ),

    operation: ($) => $.bool_or,

    // Operators
    // This section needs to match Python's operator precedence:
    // See https://docs.python.org/3/reference/expressions.html#operator-precedence
    // NOTE: The recursive cycle here helps enforce operator precedence
    //       Precedence goes up the lower down you go

    // Boolean Operations
    bool_or: ($) => choice($.bool_and, seq($.bool_or, "or", $.bool_and)),
    bool_and: ($) => choice($.bool_not, seq($.bool_and, "and", $.bool_not)),
    bool_not: ($) => choice($.comparator, seq("not", $.bool_not)),

    // Comparisions
    comparator: ($) =>
      choice(
        $.bitwise_or,
        seq($.comparator, "<", $.bitwise_or),
        seq($.comparator, ">", $.bitwise_or),
        seq($.comparator, "==", $.bitwise_or),
        seq($.comparator, "!=", $.bitwise_or),
        seq($.comparator, "<=", $.bitwise_or),
        seq($.comparator, ">=", $.bitwise_or),
        seq($.comparator, "in", $.bitwise_or),
        seq($.comparator, "not", "in", $.bitwise_or)
      ),

    // Binary Operations
    // NOTE: Keep these in sync with aug_assign above
    bitwise_or: ($) =>
      choice($.bitwise_xor, seq($.bitwise_or, "|", $.bitwise_xor)),
    bitwise_xor: ($) =>
      choice($.bitwise_and, seq($.bitwise_xor, "^", $.bitwise_and)),
    bitwise_and: ($) => choice($.shift, seq($.bitwise_and, "&", $.shift)),
    shift: ($) =>
      choice(
        $.summation,
        seq($.shift, "<<", $.summation),
        seq($.shift, ">>", $.summation)
      ),
    summation: ($) =>
      choice(
        $.product,
        seq($.summation, "+", $.product),
        seq($.summation, "-", $.product)
      ),
    product: ($) =>
      choice(
        $.unary,
        seq($.product, "*", $.unary),
        seq($.product, "/", $.unary),
        seq($.product, "%", $.unary)
      ),
    unary: ($) =>
      choice($.power, seq("+", $.power), seq("-", $.power), seq("~", $.power)),
    power: ($) => choice($.atom, seq($.power, "**", $.atom)),

    // types
    array_def: ($) =>
      seq(
        choice($.name, $.array_def, $.dyn_array_def),
        "[",
        choice($.dec_number, $.name),
        "]"
      ),
    dyn_array_def: ($) =>
      seq(
        "DynArray",
        "[",
        choice($.name, $.array_def, $.dyn_array_def),
        ",",
        choice($.dec_number, $.name),
        "]"
      ),
    tuple_def: ($) =>
      seq(
        "(",
        choice($.name, $.array_def, $.dyn_array_def, $.tuple_def),
        repeat(
          seq(",", choice($.name, $.array_def, $.dyn_array_def, $.tuple_def))
        ),
        optional(","),
        ")"
      ),
    // NOTE: Map takes a basic type and maps to another type (can be non-basic, including maps)
    _map: ($) => "HashMap",
    map_def: ($) =>
      seq($._map, "[", choice($.name, $.array_def), ",", $.type, "]"),
    type: ($) =>
      field(
        "type",
        choice(
          /[a-zA-Z_]\w*/,
          $.array_def,
          $.tuple_def,
          $.map_def,
          $.dyn_array_def
        )
      ),

    identifier: ($) => /[_\p{XID_Start}][_\p{XID_Continue}]*/,

    dec_number: ($) => /0|[1-9]\d*/i,
    hex_number: ($) => /0x[\da-f]*/i,
    oct_number: ($) => /0o[0-7]*/i,
    bin_number: ($) => /0b[0-1]*/i,
    float_number: ($) => /((\d+\.\d*|\.\d+)(e[-+]?\d+)?|\d+(e[-+]?\d+))/i,

    comment: ($) => /#[^\n]*/,
    //docstring: $ => /"""\n.*"""\n/si,
  },
});
