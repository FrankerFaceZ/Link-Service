module.exports = {
	env: {
		node: true,
		es6: true
	},
	extends: ['eslint:recommended'],
	parser: 'babel-eslint',
	parserOptions: {
		sourceType: 'module'
	},
	globals: {
		import: false,
		require: false
	},
	rules: {
		'require-atomic-updates': 0,
		'no-console': 0,
		'accessor-pairs': ['error'],
		'block-scoped-var': ['error'],
		'for-direction': ['error'],
		'guard-for-in': ['warn'],
		'no-alert': ['error'],
		'no-caller': ['error'],
		'no-catch-shadow': ['error'],
		//'no-invalid-this': ['error'],
		'no-iterator': ['error'],
		'no-labels': ['error'],
		'no-lone-blocks': ['error'],
		'no-octal-escape': ['error'],
		'no-proto': ['warn'],
		'no-return-await': ['error'],
		'no-self-compare': ['error'],
		'no-sequences': ['error'],
		'no-shadow-restricted-names': ['error'],
		'no-template-curly-in-string': ['warn'],
		'no-throw-literal': ['error'],
		'no-undef-init': ['error'],
		'no-unmodified-loop-condition': ['error'],
		'no-use-before-define': [
			'error', {
				'functions': false,
				'classes': false
			}
		],
		'no-useless-call': ['warn'],
		'no-useless-concat': ['warn'],
		'no-useless-return': ['warn'],
		'no-void': ['error'],
		'no-warning-comments': ['warn'],
		'no-with': ['error'],
		'radix': ['error'],
		//'require-await': ['warn'],
		'valid-jsdoc': [
			'warn', {
				'requireReturn': false
			}
		],
		'yoda': ['warn'],

		'arrow-body-style': ['warn', 'as-needed'],
		'arrow-parens': ['warn', 'as-needed'],
		'arrow-spacing': ['warn'],
		'generator-star-spacing': ['warn'],
		'no-duplicate-imports': ['error'],
		'no-useless-computed-key': ['error'],
		'no-useless-constructor': ['error'],
		'no-useless-rename': ['error'],
		'no-var': ['error'],
		'no-cond-assign': ['warn'],
		'object-shorthand': ['warn'],
		'prefer-arrow-callback': ['warn', {'allowUnboundThis': true}],
		'prefer-const': ['warn', {'ignoreReadBeforeAssign': true}],
		'prefer-rest-params': ['warn'],
		'prefer-spread': ['error'],
		'prefer-template': ['warn'],
		'rest-spread-spacing': ['error', 'never'],
		'yield-star-spacing': ['warn'],

		'func-call-spacing': ['error', 'never'],
		'function-paren-newline': ['error', 'consistent'],
		'computed-property-spacing': ['error', 'never'],
		'comma-dangle': ['error', 'never'],
		'comma-spacing': ['error'],
		'comma-style': ['error'],
		'brace-style': ['error', '1tbs'],
		'block-spacing': ['error', 'always'],
		'array-bracket-newline': [
			'error', {
				'multiline': true
			}
		],
		'yoda': ['warn', 'never'],
		'no-floating-decimal': ['warn'],
		'no-labels': ['error'],
		'no-multiple-empty-lines': [
			'error', {
				'max': 2,
				'maxEOF': 1,
				'maxBOF': 0
			}
		],
		'eqeqeq': ['error', 'always', {'null': 'ignore'}],
		'dot-location': ['error', 'property'],
		'dot-notation': ['error'],
		'lines-between-class-members': ['error', 'always'],
		'key-spacing': [
			'error', {
				'beforeColon': false,
				'afterColon': true
			}
		],
		'space-unary-ops': [
			'error', {
				'words': true,
				'nonwords': false,
				'overrides': {
					'!': true
				}
			}
		],
		'space-infix-ops': ['error'],
		'object-curly-spacing': ['error', 'never'],
		'object-curly-newline': [
			'error', {
				'multiline': true,
				'consistent': true
			}
		],
		'keyword-spacing': [
			'error', {
				'before': true,
				'after': true
			}
		],
		'semi-spacing': [
			'error', {
				'before': false,
				'after': true
			}
		],
		'no-extra-semi': ['error'],
		'indent': [
			'warn',
			'tab',
			{
				'SwitchCase': 1,
				'MemberExpression': 1
			}
		],
		'linebreak-style': [
			'error',
			'unix'
		],
		'quotes': [
			'error',
			'single',
			{
				'avoidEscape': true,
				'allowTemplateLiterals': true
			}
		]
	},

	overrides: [
		{
			files: ['test/**/*.js'],
			plugins: ['mocha'],
			env: {
				mocha: true
			},
			rules: {
				'mocha/handle-done-callback': 'error',
				'mocha/max-top-level-suites': 'error',
				'mocha/no-exclusive-tests': 'error',
				'mocha/no-global-tests': 'error',
				'mocha/no-identical-title': 'error',
				'mocha/no-mocha-arrows': 'warn',
				'mocha/no-nested-tests': 'error',
				'mocha/no-pending-tests': 'warn',
				'mocha/no-return-and-callback': 'error',
				'mocha/no-setup-in-describe': 'error',
				'mocha/no-sibling-hooks': 'error',
				'mocha/no-skipped-tests': 'error',
				'prefer-arrow-callback': 0,
				'mocha/prefer-arrow-callback': ['warn', {allowUnboundThis: true}]
			}
		}
	]
};
