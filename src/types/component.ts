export type ParameterType = "text" | "color" | "image-url";

export interface ComponentParameter {
  key: string;
  type: ParameterType;
  defaultValue?: string;
}

export interface Component {
  id: string;
  name: string;
  description: string | null;
  htmlContent: string;
  scssStyles: string;
  parametersSchema: ComponentParameter[];
  width: number;
  height: number;
  thumbnailUrl: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}
