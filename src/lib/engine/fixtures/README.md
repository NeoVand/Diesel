# Independent numerical fixture

`cylinder-cycle-independent.json` contains saved results from a separate SciPy DOP853 integration of the declared ideal-air cylinder study. It records its method, tolerances, scenario, conservation residuals and sampled outputs. The browser implementation uses its own RK4 integrator; tests compare against these frozen numbers.

This is numerical reference data, not purchased geometry. Python is not executed by the application or by the test that reads this fixture. It was moved from the ignored local research folder so the same numerical check runs in a clean public checkout and in CI.
