<?php
// Legacy lending code of the example (excerpt). Cited as source LEG in the
// requirements catalogue: the legacy code is a source like any document.

const MAX_OPEN_LOANS = 5;
const FEE_PER_DAY = 0.50;

function lend(Member $member, Medium $medium): Loan
{
    if (count($member->openLoans()) >= MAX_OPEN_LOANS) {
        throw new LendingRefused('Limit of open loans reached');
    }
    return Loan::open($member, $medium, days: 28);
}

function extend(Loan $loan): void
{
    // Reservations are not checked here
    if ($loan->extensions >= 2) {
        throw new LendingRefused('No more extensions');
    }
    $loan->extensions++;
    $loan->dueDate = $loan->dueDate->modify('+28 days');
}

function lateFee(Loan $loan, DateTimeImmutable $returned): float
{
    $days = max(0, $loan->dueDate->diff($returned)->days);
    return $days * FEE_PER_DAY;
}
