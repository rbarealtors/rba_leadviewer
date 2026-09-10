- `[x]` Phase 2.1: Foundation (Days 1-2)
  - `[x]` Create API endpoints (`verify-pin`, `assign`, `assigned-to-me`)
  - `[x]` Write SQL script to set test PINs for test accounts
  - `[x]` Set up RLS policies (from design doc)
  - `[x]` Typecheck passes

- `[x]` Phase 2.2: PIN Entry UI (Days 2-3)
  - `[x]` Build `PINEntryScreen.tsx` with numeric keypad
  - `[x]` Integrate `usePINVerification` hook
  - `[x]` Test PIN entry on iOS/Android emulator and actual device
  - `[x]` Error states (shake, incorrect message)
  - `[x]` Forgot PIN link → support contact

- `[x]` Phase 2.3: Lead Card Feed (Days 3-5)
  - `[x]` Build `LeadCard.tsx` component
  - `[x]` Refactor `SalesClient.tsx` to list layout (not carousel)
  - `[x]` Add empty state
  - `[x]` Implement Realtime subscription (remove cards on reassign)
  - `[x]` Mobile responsive testing (375px, 425px, 768px)

- `[x]` Phase 2.4: Transfer Modal (Days 5-6)
  - `[x]` Build `TransferModal.tsx`
  - `[x]` Dropdown fetches active sales reps
  - `[x]` Confirmation warning + error handling
  - `[x]` Integration with `/api/leads/[id]/assign`
  - `[x]` Toast notifications

- `[x]` Phase 2.5: Integration & Testing (Days 6-7)
  - `[x]` End-to-end flow test (PIN → feed → call → transfer → disposition form)
  - `[x]` Dark mode testing (all CDS tokens)
  - `[x]` Touch target verification (44×44px minimum)
  - `[x]` Typecheck + test: `npm run typecheck && npm test && npm run build`
  - `[x]` Performance: lead card rendering smooth on slow device

