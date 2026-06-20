import { StyleProfile } from '@/styles/profiles/styleProfiles';

export const getTableStyles = (profile: StyleProfile) => ({
  table: {
    className: `w-full border-collapse ${profile.borderRadius.large} overflow-hidden shadow-sm`,
    style: { backgroundColor: profile.colors.background }
  },
  header: {
    row: {
      style: { backgroundColor: profile.colors.primary }
    },
    cell: {
      className: `px-3 py-3 text-left border-b ${profile.typography.titleWeight}`,
      style: {
        borderColor: `${profile.colors.primary}50`,
        color: profile.colors.button.primary.text
      },
      sortableClassName: 'cursor-pointer select-none hover:opacity-80'
    }
  },
  body: {
    row: {
      className: 'border-b transition-colors',
      style: {
        borderColor: profile.colors.border,
        backgroundColor: profile.colors.background,
        ':hover': { backgroundColor: `${profile.colors.primary}05` }
      }
    },
    cell: {
      className: `px-3 py-3 border-b ${profile.typography.bodySize}`,
      style: {
        borderColor: profile.colors.border,
        color: profile.colors.text.primary
      }
    }
  },
  actionButtons: {
    edit: {
      className: `w-8 h-8 flex items-center justify-center ${profile.borderRadius.small} transition`,
      style: {
        backgroundColor: `${profile.colors.primary}10`,
        color: profile.colors.primary,
        ':hover': {
          backgroundColor: `${profile.colors.primary}20`,
          color: profile.colors.text.accent
        }
      }
    },
    delete: {
      className: `w-8 h-8 flex items-center justify-center ${profile.borderRadius.small} transition`,
      style: {
        backgroundColor: `${profile.colors.button.danger.bg}20`,
        color: profile.colors.button.danger.bg,
        ':hover': {
          backgroundColor: `${profile.colors.button.danger.bg}30`,
          color: profile.colors.button.danger.hover
        }
      }
    }
  }
});

export const getFilterStyles = (profile: StyleProfile) => ({
  container: {
    className: 'mt-4',
    style: {
      backgroundColor: profile.colors.surface,
      borderColor: profile.colors.border
    }
  },
  title: {
    className: `${profile.typography.titleSize} ${profile.typography.titleWeight} mb-4`,
    style: { color: profile.colors.text.primary }
  },
  label: {
    className: `font-bold min-w-20 ${profile.typography.bodySize}`,
    style: { color: profile.colors.text.secondary }
  },
  input: {
    className: `px-3 py-2 border min-w-[500px] focus:outline-none focus:ring-2 focus:border-transparent ${profile.borderRadius.medium}`,
    style: {
      borderColor: profile.colors.border,
      backgroundColor: profile.colors.background,
      color: profile.colors.text.primary
    }
  },
  dropdown: {
    container: {
      className: `absolute top-full left-0 right-0 border ${profile.borderRadius.medium} shadow-lg z-50 max-h-80 overflow-y-auto min-w-52`,
      style: {
        backgroundColor: profile.colors.background,
        borderColor: profile.colors.border
      }
    },
    header: {
      className: 'p-3 border-b flex justify-between items-center',
      style: { borderColor: profile.colors.border }
    },
    title: {
      className: profile.typography.titleWeight,
      style: { color: profile.colors.text.primary }
    }
  },
  selectedFilters: {
    container: {
      className: 'p-3',
      style: {
        backgroundColor: `${profile.colors.primary}10`,
        borderColor: `${profile.colors.primary}30`
      }
    },
    label: {
      className: profile.typography.titleWeight,
      style: { color: profile.colors.text.primary }
    }
  }
});
