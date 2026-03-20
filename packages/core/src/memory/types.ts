/** 生灵的一生：article (前世/墓志铭总结) + events (今生事件 ID 列表) */
export interface Life {
  /** 累世聚合的文章（墓志铭），初始为空字符串 */
  article: string;
  /** 当前这一世的 WorldEventRecord ID 列表 */
  events: string[];
}
