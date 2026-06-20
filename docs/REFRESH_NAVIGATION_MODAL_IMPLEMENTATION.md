# Refresh & Navigation Modal Implementation

## Overview

This document describes the implementation of the custom discard modal that appears when users attempt to leave the create quotation page. The implementation covers 5 different types of refresh/navigation methods.

## Implementation Summary

| Method | Custom Modal? | Implementation | Notes |
|--------|---------------|---------------|-------|
| 1. **F5 key** | ✅ Yes | Keyboard interception (`keydown` event) | Fully supported with custom modal |
| 2. **Ctrl+R** | ✅ Yes | Keyboard interception (`keydown` event) | Fully supported with custom modal |
| 3. **Address bar refresh button** | ❌ No | Browser's native prompt (`beforeunload`) | Browser limitation - cannot show React modals |
| 4. **Tab close** | ❌ No | Browser's native prompt (`beforeunload`) | Browser limitation - cannot show React modals |
| 5. **Browser back/forward** | ✅ Yes | History API (`popstate` event) | Fully supported with custom modal |

## Technical Details

### 1. F5 Key & Ctrl+R (Keyboard Shortcuts)

**Location:** `src/app/sales/quotations/create/[transCode]/page.tsx` (Lines 119-141)

**Implementation:**
```typescript
const handleKeyDown = (e: KeyboardEvent) => {
  // Check for F5 or Ctrl+R (refresh shortcuts)
  if (e.key === 'F5' || (e.ctrlKey && e.key === 'r') || (e.ctrlKey && e.key === 'R')) {
    if (isLeaving) return; // Skip if intentionally leaving
    
    e.preventDefault();
    e.stopPropagation();
    
    // Show custom modal
    setShowDiscardModal(true);
    
    // Store refresh intent
    sessionStorage.setItem('__pendingRefresh', 'true');
  }
};

window.addEventListener('keydown', handleKeyDown, true);
```

**How it works:**
- Intercepts keyboard events **before** they trigger refresh
- Prevents default browser refresh behavior
- Shows custom React modal (`showDiscardModal`)
- Stores intent in `sessionStorage` for later handling

**Why it works:**
- Keyboard events fire **before** the page starts unloading
- React components can still render at this point
- Full control over the user experience

---

### 2. Address Bar Refresh Button & Tab Close

**Location:** `src/app/sales/quotations/create/[transCode]/page.tsx` (Lines 147-168)

**Implementation:**
```typescript
const handleBeforeUnload = (e: BeforeUnloadEvent) => {
  if (isLeaving) return; // Skip if intentionally leaving
  
  // Check if refresh was confirmed via custom modal
  const pendingRefresh = sessionStorage.getItem('__pendingRefresh');
  if (pendingRefresh === 'confirmed') {
    sessionStorage.removeItem('__pendingRefresh');
    return; // Allow refresh
  }
  
  // Show browser's native prompt (only option available)
  e.preventDefault();
  e.returnValue = 'Are you sure you want to leave this page?';
  return 'Are you sure you want to leave this page?';
};

window.addEventListener('beforeunload', handleBeforeUnload);
```

**How it works:**
- `beforeunload` event fires when page is about to unload
- Can only show browser's native confirmation dialog
- Cannot show React modals (page is already unloading)

**Why custom modal doesn't work:**
- `beforeunload` fires **during** page unload process
- React components cannot render during unload
- Browser security restrictions prevent custom UI during unload
- This is a **fundamental browser limitation** that cannot be worked around

**Fallback behavior:**
- Shows browser's native confirmation prompt
- User can confirm or cancel
- If confirmed, page refreshes/closes
- If cancelled, user stays on page

---

### 3. Browser Back/Forward Buttons

**Location:** `src/app/sales/quotations/create/[transCode]/page.tsx` (Lines 200-214)

**Implementation:**
```typescript
// Push state on mount to enable popstate interception
if (typeof window !== 'undefined' && window.history.state === null) {
  window.history.pushState({ preventBack: true }, '', window.location.href);
}

const handlePopState = (e: PopStateEvent) => {
  if (isLeaving) return; // Skip if intentionally leaving
  
  // Push current state back to prevent navigation
  window.history.pushState(null, '', window.location.href);
  
  // Show custom modal
  setShowDiscardModal(true);
  
  // Store navigation intent
  sessionStorage.setItem('__pendingBackForward', 'true');
};

window.addEventListener('popstate', handlePopState);
```

**How it works:**
- Pushes a state entry when component mounts
- `popstate` event fires when user clicks back/forward
- Immediately pushes state back to prevent navigation
- Shows custom React modal
- Stores intent in `sessionStorage`

**Why it works:**
- `popstate` fires **before** navigation completes
- React components can still render
- Full control over navigation flow

---

## Modal Confirmation Handling

### `handleConfirmDiscard` Function

**Location:** `src/app/sales/quotations/create/[transCode]/page.tsx` (Lines 521-600)

This function handles all confirmation scenarios:

```typescript
const handleConfirmDiscard = async () => {
  setIsLeaving(true);
  
  // Check for back/forward navigation
  const pendingBackForward = sessionStorage.getItem('__pendingBackForward');
  if (pendingBackForward === 'true') {
    sessionStorage.removeItem('__pendingBackForward');
    window.history.back(); // Allow navigation
    return;
  }
  
  // Check for refresh (F5, Ctrl+R)
  const pendingRefresh = sessionStorage.getItem('__pendingRefresh');
  if (pendingRefresh === 'true') {
    sessionStorage.setItem('__pendingRefresh', 'confirmed');
    setTimeout(() => {
      window.location.reload(); // Trigger refresh
    }, 100);
    return;
  }
  
  // Default: Navigate to quotations list
  // ... (normal navigation logic)
};
```

**Handles:**
1. **Back/Forward navigation:** Uses `history.back()` to allow navigation
2. **Refresh (F5/Ctrl+R):** Sets confirmed flag and triggers `window.location.reload()`
3. **Other navigation:** Uses Next.js router to navigate

---

## State Management

### SessionStorage Flags

The implementation uses `sessionStorage` to track navigation intent:

| Flag | Purpose | Set When | Cleared When |
|------|---------|-----------|--------------|
| `__pendingRefresh` | Tracks refresh intent (F5/Ctrl+R) | User presses F5/Ctrl+R | After confirmation or cancellation |
| `__pendingBackForward` | Tracks back/forward navigation | User clicks back/forward | After confirmation or cancellation |
| `__shouldShowModalOnReturn` | Legacy flag (not actively used) | - | On page load |

### Component State

| State Variable | Purpose |
|----------------|---------|
| `showDiscardModal` | Controls visibility of custom discard modal |
| `isLeaving` | Prevents prompts when intentionally navigating (e.g., after save) |

---

## Browser Limitations

### Why Some Methods Can't Show Custom Modals

**Address Bar Refresh & Tab Close:**
- `beforeunload` event fires **during** page unload
- React cannot render components during unload
- Browser security restrictions prevent custom UI
- **This is a fundamental limitation** - not a bug or missing feature

**Workaround:**
- Use browser's native confirmation prompt
- Provides similar functionality (confirm/cancel)
- Cannot be customized beyond the message text

---

## Code Structure

### Event Listeners Setup

**Location:** `src/app/sales/quotations/create/[transCode]/page.tsx` (Lines 117-220)

```typescript
useEffect(() => {
  // 1. Keyboard shortcuts (F5, Ctrl+R)
  const handleKeyDown = (e: KeyboardEvent) => { /* ... */ };
  window.addEventListener('keydown', handleKeyDown, true);
  
  // 2. Page unload (address bar refresh, tab close)
  const handleBeforeUnload = (e: BeforeUnloadEvent) => { /* ... */ };
  window.addEventListener('beforeunload', handleBeforeUnload);
  
  // 3. Browser navigation (back/forward)
  const handlePopState = (e: PopStateEvent) => { /* ... */ };
  window.addEventListener('popstate', handlePopState);
  
  // Cleanup
  return () => {
    window.removeEventListener('keydown', handleKeyDown, true);
    window.removeEventListener('beforeunload', handleBeforeUnload);
    window.removeEventListener('popstate', handlePopState);
  };
}, [isLeaving]);
```

### Initialization

**Location:** `src/app/sales/quotations/create/[transCode]/page.tsx` (Lines 57-84)

```typescript
useEffect(() => {
  // Clear any leftover flags from previous page load
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('__pendingRefresh');
    sessionStorage.removeItem('__pendingBackForward');
    sessionStorage.removeItem('__shouldShowModalOnReturn');
  }
  
  // ... rest of initialization
}, [transCode]);
```

---

## User Experience Flow

### Scenario 1: User Presses F5

1. User presses F5
2. `keydown` event fires
3. Default refresh prevented
4. Custom modal appears
5. User clicks "Discard" → Page refreshes
6. User clicks "Cancel" → Stays on page

### Scenario 2: User Clicks Address Bar Refresh

1. User clicks refresh button
2. `beforeunload` event fires
3. Browser's native prompt appears (custom modal cannot be shown)
4. User confirms → Page refreshes
5. User cancels → Stays on page

### Scenario 3: User Clicks Browser Back

1. User clicks back button
2. `popstate` event fires
3. Navigation prevented
4. Custom modal appears
5. User clicks "Discard" → Navigation proceeds
6. User clicks "Cancel" → Stays on page

---

## Testing Checklist

- [ ] F5 key shows custom modal
- [ ] Ctrl+R shows custom modal
- [ ] Address bar refresh shows browser prompt
- [ ] Tab close shows browser prompt
- [ ] Browser back shows custom modal
- [ ] Browser forward shows custom modal
- [ ] Modal "Discard" button works for all methods
- [ ] Modal "Cancel" button works for all methods
- [ ] No modal appears after successful save (`isLeaving` flag)
- [ ] SessionStorage flags are cleared on page load

---

## Future Improvements

### Potential Enhancements

1. **Better Address Bar Refresh Handling:**
   - Currently limited by browser constraints
   - Could potentially use Service Workers (experimental)
   - Not recommended due to complexity and limited browser support

2. **Tab Close Detection:**
   - Could use `visibilitychange` API to detect tab becoming hidden
   - Still cannot show modal during unload
   - Could show warning before user attempts to close

3. **Navigation State Persistence:**
   - Could save form state to `sessionStorage` before navigation
   - Restore state if user returns
   - Would require significant refactoring

---

## Related Files

- **Main Implementation:** `src/app/sales/quotations/create/[transCode]/page.tsx`
- **Modal Component:** Ant Design `Modal` component (built-in)
- **Router Interception:** Same file, separate `useEffect` for Next.js router

---

## References

- [MDN: beforeunload event](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event)
- [MDN: popstate event](https://developer.mozilla.org/en-US/docs/Web/API/Window/popstate_event)
- [MDN: KeyboardEvent](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent)
- [Next.js Router API](https://nextjs.org/docs/app/api-reference/functions/use-router)

---

## Summary

This implementation provides the best possible user experience for preventing accidental data loss when leaving the create quotation page. While browser limitations prevent custom modals for address bar refresh and tab close, the implementation covers all other scenarios with a consistent, user-friendly custom modal interface.

**Key Takeaway:** Custom React modals can only be shown for events that fire **before** the page starts unloading. Events that fire **during** unload (like `beforeunload`) can only use the browser's native prompt.

