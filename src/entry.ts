// The design review is opt-in and never starts the camera or loads saved settings.
if (new URLSearchParams(location.search).get('review') === 'wordmarks') {
  void import('./view/wordmark-gallery').then(({ renderGallery }) => renderGallery());
} else {
  void import('./main');
}
