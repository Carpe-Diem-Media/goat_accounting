BEGIN;

ALTER TABLE estimator.pricing_rules
  DROP CONSTRAINT pricing_rules_input_key_format,
  ADD CONSTRAINT pricing_rules_input_key_format CHECK (
    (rule_type IN ('FIXED_RANGE', 'REVIEW_TRIGGER') AND input_key IS NULL)
    OR (
      rule_type NOT IN ('FIXED_RANGE', 'REVIEW_TRIGGER')
      AND input_key IS NOT NULL
      AND input_key IN (
        'urgency',
        'business.entityType',
        'business.booksStatus',
        'business.recordCondition',
        'business.monthlyTransactionVolume',
        'business.financialAccounts',
        'business.employeeCount',
        'business.taxPosition',
        'business.ongoingServices',
        'business.vatFilingFrequency',
        'business.complexityFactors',
        'business.bankStatementsAvailableForFullPeriod',
        'business.outstandingComplianceAreas',
        'personal.currentStatus',
        'personal.incomeSources',
        'personal.sarsPosition',
        'personal.ongoingRequirements',
        'personal.rentalPropertyCount',
        'personal.foreignIncomePresent',
        'personal.capitalGainsOccurred',
        'business.entityCount',
        'business.outstandingMonths',
        'personal.outstandingYears'
      )
    )
  );

COMMIT;
