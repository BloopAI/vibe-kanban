export interface ShowcaseMedia {
  type: 'image' | 'video';
  src: string;
  poster?: string;
  alt?: string;
}

export interface ShowcaseStage {
  titleKey: string;
  descriptionKey: string;
  media: ShowcaseMedia;
}

export interface ShowcaseConfig {
  id: string;
  stages: ShowcaseStage[];
}
