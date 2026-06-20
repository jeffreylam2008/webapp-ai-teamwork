export interface StyleProfile {
  id: string;
  name: string;
  description: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: {
      primary: string;
      secondary: string;
      accent: string;
    };
    border: string;
    shadow: string;
    button: {
      primary: {
        bg: string;
        hover: string;
        text: string;
      };
      secondary: {
        bg: string;
        hover: string;
        text: string;
      };
      danger: {
        bg: string;
        hover: string;
        text: string;
      };
    };
  };
  typography: {
    titleSize: string;
    titleWeight: string;
    bodySize: string;
    buttonSize: string;
  };
  spacing: {
    container: string;
    card: string;
    button: string;
  };
  borderRadius: {
    small: string;
    medium: string;
    large: string;
  };
}

export const styleProfiles: StyleProfile[] = [
  {
    id: 'default',
    name: 'Default Blue',
    description: 'Classic blue theme with modern styling',
    colors: {
      primary: '#1890ff',
      secondary: '#f0f2f5',
      accent: '#52c41a',
      background: '#ffffff',
      surface: '#fafafa',
      text: {
        primary: '#262626',
        secondary: '#595959',
        accent: '#1890ff'
      },
      border: '#d9d9d9',
      shadow: 'shadow-md',
      button: {
        primary: {
          bg: 'bg-blue-600',
          hover: 'hover:bg-blue-700',
          text: 'text-white'
        },
        secondary: {
          bg: 'bg-gray-200',
          hover: 'hover:bg-gray-300',
          text: 'text-gray-800'
        },
        danger: {
          bg: 'bg-red-600',
          hover: 'hover:bg-red-700',
          text: 'text-white'
        }
      }
    },
    typography: {
      titleSize: 'text-2xl',
      titleWeight: 'font-bold',
      bodySize: 'text-base',
      buttonSize: 'text-sm'
    },
    spacing: {
      container: 'p-6',
      card: 'p-4',
      button: 'px-4 py-2'
    },
    borderRadius: {
      small: 'rounded-sm',
      medium: 'rounded-md',
      large: 'rounded-lg'
    }
  },
  {
    id: 'dark',
    name: 'Dark Theme',
    description: 'Modern dark theme for reduced eye strain',
    colors: {
      primary: '#177ddc',
      secondary: '#1f1f1f',
      accent: '#73d13d',
      background: '#141414',
      surface: '#1f1f1f',
      text: {
        primary: '#ffffff',
        secondary: '#a6a6a6',
        accent: '#177ddc'
      },
      border: '#404040',
      shadow: 'shadow-lg',
      button: {
        primary: {
          bg: 'bg-blue-700',
          hover: 'hover:bg-blue-800',
          text: 'text-white'
        },
        secondary: {
          bg: 'bg-gray-700',
          hover: 'hover:bg-gray-600',
          text: 'text-gray-200'
        },
        danger: {
          bg: 'bg-red-700',
          hover: 'hover:bg-red-800',
          text: 'text-white'
        }
      }
    },
    typography: {
      titleSize: 'text-2xl',
      titleWeight: 'font-bold',
      bodySize: 'text-base',
      buttonSize: 'text-sm'
    },
    spacing: {
      container: 'p-6',
      card: 'p-4',
      button: 'px-4 py-2'
    },
    borderRadius: {
      small: 'rounded-sm',
      medium: 'rounded-md',
      large: 'rounded-lg'
    }
  }
];

export const getStyleProfile = (profileId: string): StyleProfile => {
  return styleProfiles.find(profile => profile.id === profileId) || styleProfiles[0];
};

export default {
  styleProfiles,
  getStyleProfile
};