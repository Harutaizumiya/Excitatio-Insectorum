export default defineAppConfig({
  pages: [
    'pages/login/index',
    'pages/classroom/index',
    'pages/history/index',
    'pages/announcements/index',
    'pages/profile/index',
  ],
  window: {
    navigationBarTitleText: '课序',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTextStyle: 'black',
    backgroundColor: '#f5f6f8',
  },
  requiredBackgroundModes: [],
  lazyCodeLoading: 'requiredComponents',
});
